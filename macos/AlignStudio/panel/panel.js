(function(){
'use strict';
var $=function(id){return document.getElementById(id);}, target='selection',busy=false,ready=false,request=0;
var watchdog=null,disposed=false,themeListening=false,cep=window.__adobe_cep__;
function svg(kind,axis,edge){
 var standard={};
 if(standard[kind])return '<span class="fa-glyph" aria-hidden="true">&#x'+standard[kind]+';</span>';
 var stroke=kind==='align'?1.5:1;
 var shapes='',rect=function(x,y,w,h){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="currentColor"/>';},line=function(a,b,c,d){return '<path d="M'+a+' '+b+'L'+c+' '+d+'" fill="none" stroke="currentColor" stroke-width="'+stroke+'"/>';},box=function(x,y,w,h){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="none" stroke="currentColor" stroke-width="'+stroke+'"/>';};
 // AE-specific geometry: fine rules, solid layer blocks. Standard actions use Font Awesome.
 if(kind==='align'){var r=[2.5,12,21.5][edge];shapes=line(r,2,r,22);[10,15].forEach(function(w,i){shapes+=rect(edge===0?r+2:edge===1?r-w/2:r-w-2,4+i*10,w,6);});}
 else if(kind==='centers'){[4,12,20].forEach(function(x,i){var h=[10,18,12][i];shapes+=line(x,1,x,23)+rect(x-2.5,12-h/2,5,h);});}
 else if(kind==='gaps'){shapes=rect(1,7,5,10)+rect(10,3,5,18)+rect(19,6,4,12)+line(8,2,8,22)+line(17,2,17,22);}
 else if(kind==='fixed'){shapes=rect(4,9,6,12)+rect(15,5,6,16)+line(3,3,21,3)+'<path d="M7 0L11 3L7 6ZM17 0L13 3L17 6Z" fill="currentColor"/>';}
 else if(kind==='key'){shapes=box(2.5,2.5,14,14)+box(8.5,8.5,13,13)+rect(12,12,6,6);}
 else if(kind==='comp'){shapes=box(3.5,3.5,17,17)+rect(2,2,3,3)+rect(19,2,3,3)+rect(2,19,3,3)+rect(19,19,3,3);}
 else if(kind==='selection'){shapes=box(5.5,5.5,13,13)+line(12,2,12,22)+line(2,12,22,12);[[3,3],[18,3],[3,18],[18,18]].forEach(function(p){shapes+=rect(p[0],p[1],3,3);});}
 else if(kind==='action'||kind==='title'){shapes=box(2.5,3.5,19,17);var m=kind==='action'?6:9;shapes+=box(m,m,24-m*2,24-m*2)+rect(1,10,3,4)+rect(20,10,3,4)+rect(10,2,4,3)+rect(10,19,4,3);}
 return '<svg viewBox="0 0 24 24" aria-hidden="true"><g'+(axis===1||axis===2?' transform="matrix(0 1 1 0 0 0)"':'')+'>'+shapes+'</g>'+(axis===2?'<text x="17" y="23" fill="currentColor" font-size="9" font-weight="bold">Z</text>':'')+'</svg>';
}
function status(text,error){$('status').textContent=text;$('status').title=text;$('status').className=error?'error':'';}
function call(command,op,options,done){
 if(disposed||busy||(command!=='status'&&!ready))return;
 if(!cep){status('Open this panel from After Effects > Window > Extensions.',true);return;}
 busy=true;update();status('Working…');var token=++request;
 // A UI timeout cannot cancel ExtendScript. Keep the request locked and accept
 // its eventual reply instead of queuing Refresh behind an unfinished command.
 watchdog=setTimeout(function(){if(disposed||token!==request)return;watchdog=null;ready=false;status('Still waiting for AE. The operation has not been cancelled. Check AE for a dialog; if it stays unresponsive, inspect the project before restarting AE.',true);update();},60000);
 try{
 var script='AlignStudioWheelCall('+[command,op||null,options||null].map(function(x){return JSON.stringify(x).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}).join(',')+')';
 cep.evalScript(script,function(raw){
   if(disposed||token!==request)return;clearTimeout(watchdog);watchdog=null;++request;busy=false;
   try{var result=JSON.parse(raw);if(!result||typeof result.ok!=='boolean'||typeof result.message!=='string')throw Error('Invalid host response');ready=command==='status'?result.ok:true;status(result.message,!result.ok);if(result.ok&&done)done(result.message);}
   catch(e){ready=false;status('After Effects did not return a valid result. Result unknown: inspect AE and Undo, then Refresh.',true);}
   update();
 });}catch(e){clearTimeout(watchdog);watchdog=null;++request;busy=false;ready=false;status('Connection failed. Inspect AE and Undo before using Refresh. '+e.message,true);update();}
}
function options(){return {target:target,space:$('space').value,bounds:$('bounds').value,text:$('text').value,animation:$('animation').value,group:$('group').checked,gap:$('gap').value,margin:$('margin').value};}
function persist(){try{var o=options();delete o.animation;delete o.group;localStorage.setItem('alignStudioOptions',JSON.stringify(o));}catch(e){}}
function action(parent,title,kind,axis,edge){var b=document.createElement('button');b.className='icon';b.dataset.tooltip=title;b.setAttribute('aria-label',title);b.innerHTML=svg(kind,axis,edge);b.dataset.kind=kind;b.dataset.axis=axis;b.onclick=function(){persist();call('run',{kind:kind,axis:axis,edge:edge},options());};$(parent).appendChild(b);}
['Left','Center X','Right','Top','Center Y','Bottom'].forEach(function(t,i){action('align',t,'align',i<3?0:1,i%3);});
action('distribute','Distribute centers X','centers',0,1);action('distribute','Distribute centers Y','centers',1,1);action('distribute','Equal gaps X','gaps',0,0);action('distribute','Equal gaps Y','gaps',1,0);
action('gaps','Set gap X','fixed',0,0);action('gaps','Set gap Y','fixed',1,0);
['Min Z','Center Z','Max Z'].forEach(function(t,i){action('depthAlign',t,'align',2,i);});action('depthDist','Distribute centers Z','centers',2,1);action('depthDist','Set gap Z','fixed',2,0);
['selection','comp','action','title','key'].forEach(function(t,i){var b=document.createElement('button');b.className='icon';b.dataset.tooltip='Align to '+['Selection','Composition','Action safe (90%)','Title safe (80%)','Key layer'][i];b.setAttribute('aria-label',b.dataset.tooltip);b.dataset.target=t;b.innerHTML=svg(t);b.onclick=function(){target=t;if(['comp','action','title'].indexOf(t)!==-1)$('space').value='view';update();persist();};$('targets').appendChild(b);});
function update(){
 $('viewport').setAttribute('aria-busy',String(busy));
 $('options').hidden=!$('advanced').checked;$('keyRow').hidden=target!=='key';$('optionsLabel').textContent=$('animation').value==='offset'?'Options: All keys':'Options';$('unit').textContent=$('space').value==='world'?'units':'px';
 document.querySelectorAll('[data-target]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.target===target));b.disabled=busy;});
 document.querySelectorAll('[data-kind]').forEach(function(b){b.disabled=busy||!ready||(b.dataset.axis==='2'&&$('space').value!=='world')||(b.dataset.kind!=='align'&&$('group').checked);});
 $('gapMinus').disabled=busy;$('gapPlus').disabled=busy;$('refresh').disabled=busy;
 document.querySelectorAll('input,select').forEach(function(c){c.disabled=busy;});$('margin').disabled=busy||['comp','action','title'].indexOf(target)===-1;
}
['space','bounds','text','animation','group','advanced','gap','margin'].forEach(function(id){$(id).addEventListener('change',function(){if(id==='space'&&this.value==='world'&&['comp','action','title'].indexOf(target)!==-1)target='selection';update();persist();});});
// Capture wheel before native selects can change values. One scroll surface handles every control.
document.addEventListener('wheel',function(e){var v=$('viewport');if(e.ctrlKey)return;var delta=e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?v.clientHeight:1);if(!delta)return;e.preventDefault();v.scrollTop+=delta;},{passive:false,capture:true});
function stepGap(direction,event){
 if(busy||disposed)return;
 var raw=$('gap').value.trim(),value=Number(raw);
 if(!raw||!isFinite(value)){status('Enter a spacing number before using + or −.',true);return;}
 var next=event&&event.shiftKey?(direction>0?Math.floor(value/10)+1:Math.ceil(value/10)-1)*10:value+direction;
 next=Math.round(next*1000000)/1000000;
 if(!isFinite(next)||Math.abs(next)>9007199254740991||next===value){status('Spacing is outside the supported range.',true);return;}
 $('gap').value=String(next===0?0:next);persist();
}
$('gapMinus').onclick=function(e){stepGap(-1,e);};$('gapPlus').onclick=function(e){stepGap(1,e);};
$('refresh').onclick=function(){call('status');};$('help').onclick=function(){$('helpText').hidden=!$('helpText').hidden;if(!$('helpText').hidden)$('helpText').scrollIntoView({block:'nearest'});};
try{var saved=JSON.parse(localStorage.getItem('alignStudioOptions')||'null');if(saved&&typeof saved==='object'){
 if(['view','world'].indexOf(saved.space)!==-1)$('space').value=saved.space;
 if(['content','extents','paragraph','source'].indexOf(saved.bounds)!==-1)$('bounds').value=saved.bounds;
 if(['balanced','glyph'].indexOf(saved.text)!==-1)$('text').value=saved.text;
 ['gap','margin'].forEach(function(id){var v=saved[id];if((typeof v==='string'||typeof v==='number')&&String(v).trim()!==''&&isFinite(Number(v))&&(id!=='margin'||Number(v)>=0))$(id).value=String(v);});
 if(['selection','comp','action','title','key'].indexOf(saved.target)!==-1)target=saved.target;
 if(['comp','action','title'].indexOf(target)!==-1)$('space').value='view';
}}catch(e){}
function theme(){try{var env=JSON.parse(window.__adobe_cep__.getHostEnvironment()),c=env.appSkinInfo.panelBackgroundColor.color;document.documentElement.style.setProperty('--bg','rgb('+c.red+','+c.green+','+c.blue+')');}catch(e){}}
function dispose(){
 if(disposed)return;disposed=true;++request;clearTimeout(watchdog);watchdog=null;
 if(themeListening)try{cep.removeEventListener('com.adobe.csxs.events.ThemeColorChanged',theme);}catch(e){}
}
window.addEventListener('unload',dispose);
theme();if(cep)try{cep.addEventListener('com.adobe.csxs.events.ThemeColorChanged',theme);themeListening=true;}catch(e){}
update();call('status');
})();

