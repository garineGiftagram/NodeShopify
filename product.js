function GG_clickedOnGiftThis(data = []) {
    alert('Hello World');
};

document.addEventListener('DOMContentLoaded', (event) => {
    myFunction();
})

function myFunction() {
    var x = document.getElementsByClassName("site-footer__item-inner");
    x[0].innerHTML = "Hello World!";
}