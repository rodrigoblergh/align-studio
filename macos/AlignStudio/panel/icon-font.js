(function(){
 'use strict';
 // Keep legible local silhouettes until the bundled font has actually loaded.
 var paths={
  '61572':'M7 2a5 5 0 1 0 3 9l3 3v3h3v3h4v-5l-8-8A5 5 0 0 0 7 2zm-1 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  '61704':'M2 3h20v14H2zm2 2v10h16V5zm6 13h4v2h4v2H6v-2h4z',
  '61529':'M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22zm-1 16h2v3h-2zm-3-9c0-6 10-6 10 0 0 3-5 4-5 7h-2c0-5 5-5 5-7 0-3-6-3-6 0z',
  '61473':'M20 2v7h-7l3-3A7 7 0 0 0 5 11H2a10 10 0 0 1 16-7zm-16 20v-7h7l-3 3a7 7 0 0 0 11-5h3a10 10 0 0 1-16 7z',
  '61543':'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z',
  '61544':'M2 10h20v4H2z'
 };
 document.querySelectorAll('.fa-glyph').forEach(function(el){var path=paths[el.textContent.charCodeAt(0)];if(!path)return;var fallback=document.createElement('span');fallback.className='icon-fallback';fallback.setAttribute('aria-hidden','true');fallback.innerHTML='<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="'+path+'"/></svg>';el.parentNode.insertBefore(fallback,el);});
 if(document.fonts&&document.fonts.load)document.fonts.load('17px AlignFontAwesome').then(function(fonts){if(fonts.length)document.documentElement.classList.add('icons-font-ready');}).catch(function(){});
})();
