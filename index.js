const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
var session = require('express-session')

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = 'read_products, write_products, ' +
    'write_script_tags, read_script_tags,read_content,write_content, ' + 
    'read_products,write_products,read_checkouts,write_checkouts, read_online_store_pages, ' + 
    'unauthenticated_read_product_listings, unauthenticated_read_content, ' + 
    'unauthenticated_read_customer_tags, unauthenticated_read_product_tags' ;
const forwardingAddress = "https://029cba2f.ngrok.io"; // Replace this with your HTTPS Forwarding address


//middleware
app.use(session({ secret: 'ssshhhhh', resave: false, saveUninitialized: true }));

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.get('/shopify', (req, res) => {
    shop = req.query.shop;
    if (shop) {
        const state = nonce();
        const redirectUri = forwardingAddress + '/shopify/callback';
        const installUrl = 'https://' + shop +
            '/admin/oauth/authorize?client_id=' + apiKey +
            '&scope=' + scopes +
            '&state=' + state +
            '&redirect_uri=' + redirectUri;

        res.cookie('state', state);
        res.redirect(installUrl);
    } else {
        return res.status(400).send('Missing shop parameter. Please add ?shop={shop} to your request');
    }
});

app.get('/shopify/callback', (req, res) => {
    var sess = req.session;
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;
    sess.shop = shop;
    if (state !== stateCookie) {
        return res.status(403).send('Request origin cannot be verified');
    }

    if (shop && hmac && code) {
        // DONE: Validate request is from Shopify
        const map = Object.assign({}, req.query);
        delete map['signature'];
        delete map['hmac'];
        const message = querystring.stringify(map);
        const providedHmac = Buffer.from(hmac, 'utf-8');
        const generatedHash = Buffer.from(
            crypto
                .createHmac('sha256', apiSecret)
                .update(message)
                .digest('hex'),
            'utf-8'
        );
        let hashEquals = false;

        try {
            hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
        } catch (e) {
            hashEquals = false;
        };

        if (!hashEquals) {
            return res.status(400).send('HMAC validation failed');
        }

        // DONE: Exchange temporary code for a permanent access token
        const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
        const accessTokenPayload = {
            client_id: apiKey,
            client_secret: apiSecret,
            code,
        };

        request.post(accessTokenRequestUrl, { json: accessTokenPayload })
            .then((accessTokenResponse) => {
                accessToken = accessTokenResponse.access_token;
                sess.accessToken = accessToken;
                console.log('user access');
                console.log(accessToken);
                // DONE: Use access token to make API call to 'shop' endpoint
                const shopRequestUrl = 'https://' + shop + '/admin/api/2019-10/shop.json';
                const shopRequestHeaders = {
                    'X-Shopify-Access-Token': accessToken,
                };

                request.get(shopRequestUrl, { headers: shopRequestHeaders })
                    .then((shopResponse) => {
                        res.status(200).end(shopResponse);
                    })
                    .catch((error) => {
                        res.status(error.statusCode).send(error.error.error_description);
                    });
            })
            .catch((error) => {
                res.status(error.statusCode).send(error.error.error_description);
            });

    } else {
        res.status(400).send('Required parameters missing');
    }
});

app.get('/store/token', (req, res) => {
    var sess = req.session;
    const storeFrontAccessTokenURL = 'https://' + sess.shop + '/admin/api/2019-10/storefront_access_tokens.json';
    const requestHeaders = {
        'X-Shopify-Access-Token': sess.accessToken,
    };
    const val = {
        "storefront_access_token": {
            "title": "Test"
        }
    };
    request.post(storeFrontAccessTokenURL, { headers: requestHeaders, json: val })
        .then((accessTokenResponse) => {
            sess.storefrontAccessToken = accessTokenResponse.storefront_access_token.access_token;
            res.status(200).send(accessTokenResponse);
        })
        .catch((error) => {
            res.send(error);
            res.status(error.statusCode).send(error.error.error_description);
        });
});

app.get('/master-pages', (req, res) => {
    sess = req.session;
    const shopRequestUrl = 'https://' + shop + '/master_pages.json';
    console.log('Store access');
    console.log(sess.storefrontAccessToken);
    const shopRequestHeaders = {
        'X-Shopify-Storefront-Access-Token': sess.storefrontAccessToken,
    };
    request.get(shopRequestUrl, { headers: shopRequestHeaders })
        .then((shopResponse) => {
            res.status(200).end(shopResponse);
        })
        .catch((error) => {
            res.status(error.statusCode).send(error);
        });
});


app.listen(3000, () => {
    console.log('App listening on port 3000!');
});