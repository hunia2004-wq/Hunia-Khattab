/* This file controls the product popup in the Gift Grid: opening and closing it, picking a color and size, and adding the product to the cart. It uses plain JavaScript only */
(function () {
  /* This turns on strict mode, so the browser warns about coding mistakes instead of ignoring them */
  'use strict';

  /*If this file already ran once on the page, it stops here, so the click listener below never gets added twice (which would add every product to the cart twice) */
  if (window.giftGridLoaded) return;
  
  window.giftGridLoaded = true;

  /* This is the handle (the end of the product link) of the free bonus product that gets added with Black + Medium. To change the bonus product, change it here */
  var BONUS_HANDLE = 'dark-winter-jacket';

  /* FUNCTION 1: reads what the customer picked in the popup (color, size...) and returns it as a list in the same order as the options, for example ['Black', 'M'] */
  function getSelectedOptions(form) {
    /* This finds every option box in the popup (one for color, one for size) and goes through them one by one */
    return Array.from(form.querySelectorAll('.popup_option')).map(function (group) {
      /* This looks for a color button that is picked in this box */
      var radio = group.querySelector('input[type="radio"]:checked');
      /* This looks for a dropdown in this box (the size) */
      var select = group.querySelector('select');
      /* This gives back the picked color, or the picked size, or an empty text '' if the customer has not picked anything in this box yet */
      return radio ? radio.value : select ? select.value : '';
    });
  }

  /* FUNCTION 2: finds the exact variant (for example Black + M) that matches what the customer picked. It gives back nothing (undefined) if that combination does not exist */
  function findVariant(variants, selected) {
    /* This goes through all the variants of the product and stops at the first one that matches */
    return variants.find(function (variant) {
      /* A variant matches only if every picked value is the same as its option1, option2, option3 in the same order */
      return selected.every(function (value, i) {
        return variant['option' + (i + 1)] === value;
      });
    });
  }

  /* FUNCTION 3: checks if the customer picked Black together with a Medium size. It gives back true or false */
  function isBlackMedium(selected) {
    /* This turns every picked value into lowercase, so "Black" and "black" count the same */
    var values = selected.map(function (value) { return value.toLowerCase(); });
    /* This is true only if "black" is picked AND the size is "medium" or "m" */
    return values.indexOf('black') !== -1 &&
      (values.indexOf('medium') !== -1 || values.indexOf('m') !== -1);
  }

  /* FUNCTION 4: finds the id of the bonus product so it can be added to the cart. It gives back null if the product is not found or is out of stock */
  function getBonusVariantId() {
    /* This asks Shopify for the bonus product's information, using its handle */
    return fetch('/products/' + BONUS_HANDLE + '.js')
      /* If Shopify found the product we read its information, if not we continue with nothing */
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (product) {
        /* If there is no product, we stop here and give back null */
        if (!product) return null;
        /* This picks the first variant of the bonus product that is in stock */
        var variant = product.variants.find(function (v) { return v.available; });
        /* This gives back the id of that variant, or null if all of them are sold out */
        return variant ? variant.id : null;
      })
      /* If anything goes wrong while looking for the bonus product, we give back null so the main product can still be added */
      .catch(function () { return null; });
  }

  /* FUNCTION 5: shows a short message on the button (like "Added!"), then puts the "Add to cart" text back after 1 second. It can also close the popup at that moment */
  function flashLabel(button, text, closePopup) {
    /* This is the text inside the button */
    var label = button.querySelector('span');
    /* This replaces the button text with the message */
    label.textContent = text;
    /* This waits 1 second (1000 milliseconds) and then runs the code inside */
    setTimeout(function () {
      /* This puts the normal button text back */
      label.textContent = 'Add to cart';
      /* This closes the popup, but only when we asked for it (after a successful add) */
      if (closePopup) button.closest('dialog').close();
    }, 1000);
  }

  /* FUNCTION 6: the main one. It checks the choices, finds the variant and adds it to the cart (together with the bonus product when the customer picks Black + Medium) in one request */
  function addToCart(button) {
    /* This is the form part of the popup that holds the options and the button */
    var form = button.closest('[data-product-form]');
    /* This is the size dropdown inside that form */
    var select = form.querySelector('select');

    /* If the size is still on "Choose your size", the browser shows its own "please select an item" message and we stop */
    if (select && !select.checkValidity()) {
      select.reportValidity();
      return;
    }

    /* This reads everything the customer picked, for example ['Black', 'M'] */
    var selected = getSelectedOptions(form);

    /* If something is still empty (usually the color, as no color is preselected), the button says "Choose your options" and we stop */
    if (selected.indexOf('') !== -1) {
      flashLabel(button, 'Choose your options', false);
      return;
    }

    /* This reads the list of all variants of the product that the Liquid file saved inside the popup */
    var variants = JSON.parse(form.querySelector('[data-variants]').textContent);
    /* This finds the variant that matches the picked color and size */
    var variant = findVariant(variants, selected);

    /* If there is no such variant, or it is out of stock, the button says "Sold out" and we stop */
    if (!variant || !variant.available) {
      flashLabel(button, 'Sold out', false);
      return;
    }

    /* This turns the button off while we are adding, so a double click cannot add the product twice */
    button.disabled = true;

    /* We only look for the bonus product when the customer picked Black + Medium. In every other case we skip it */
    var bonusRequest = isBlackMedium(selected) ? getBonusVariantId() : Promise.resolve(null);

       bonusRequest
      .then(function (bonusId) {
        /* This is the list of things to add to the cart: the picked product first */
        var items = [{ id: variant.id, quantity: 1 }];
        /* This adds the bonus product to the list too, unless the customer already picked the bonus product itself (so it is not added twice) */
        if (bonusId && bonusId !== variant.id) items.push({ id: bonusId, quantity: 1 });

        /* This sends the whole list to the Shopify cart in one request */
        return fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: items })
        });
      })
            .then(function (response) {
        /* If Shopify did not accept the request, we jump to the error part below */
        if (!response.ok) throw new Error('Add to cart failed');
        /* If it worked, the button says "Added!" and the popup closes after 1 second */
        flashLabel(button, 'Added!', true);
      })
      .catch(function (error) {
        /* This writes the error in the browser console, so you can see what went wrong */
        console.error(error);
        /* The button tells the customer something went wrong, and the popup stays open */
        flashLabel(button, 'Error, try again', false);
      })
      /* This turns the button back on, whether the adding worked or not */
      .then(function () { button.disabled = false; });
  }

  /* CLICK LISTENER: one listener for the whole page that reacts to every click. This way it still works when the theme editor reloads the section */
  document.addEventListener('click', function (event) {
    /* This is the exact thing the customer clicked */
    var target = event.target;

    /* 1. The "+" circle on a tile: finds the popup with the matching id and opens it */
    var hotspot = target.closest('[data-popup-target]');
    if (hotspot) {
      var popup = document.getElementById(hotspot.dataset.popupTarget);
      /* This only opens the popup if it exists and the browser supports the dialog element */
      if (popup && typeof popup.showModal === 'function') {
        /* This opens the popup in the middle of the screen and dims the page behind it */
        popup.showModal();
        /* This puts the focus on the popup itself, so the close button does not get the focus outline when the popup opens */
        popup.focus();
      }
      return;
    }

    /* 2. The "×" button in the corner: closes the popup it sits in */
    var closeButton = target.closest('[data-popup-close]');
    if (closeButton) {
      closeButton.closest('dialog').close();
      return;
    }

    /* 3. The black "Add to cart" button: runs the main function above */
    var addButton = target.closest('[data-add-to-cart]');
    if (addButton) {
      addToCart(addButton);
      return;
    }

 
  });
})();