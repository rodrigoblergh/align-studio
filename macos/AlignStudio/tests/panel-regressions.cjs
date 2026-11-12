const fs=require('fs'),vm=require('vm'),assert=require('assert');
const base=process.argv[2]||require('path').resolve(__dirname,'../panel'), lines=[];
function test(name,fn){try{fn();lines.push('PASS '+name);}catch(e){lines.push('FAIL '+name+' | '+e.stack);process.exitCode=1;}}
function fixture(savedPrefs){
 const nodes=[],ids={},timers=new Map(),pending=[],storage={},windowEvents={},themeEvents=[];let timerId=0;if(savedPrefs!==undefined)storage.alignStudioOptions=JSON.stringify(savedPrefs);
 class Element{
  constructor(tag,id){this.tagName=tag;this.id=id;this.dataset=new Proxy({}, {set:(o,k,v)=>(o[k]=String(v),true)});this.attributes={};this.children=[];this.events={};this.value='';this.textContent='';this.hidden=false;this.checked=false;this.disabled=false;this.scrollTop=0;this.clientHeight=180;nodes.push(this);if(id)ids[id]=this;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  appendChild(c){this.children.push(c);c.parent=this;}
  addEventListener(k,f,opts){this.events[k]=f;this.eventOptions=opts;}
  scrollIntoView(){}
 }
 const html=fs.readFileSync(base+'/index.html','utf8');
 for(const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1],match[2]);const value=match[0].match(/\bvalue="([^"]*)"/);if(value)e.value=value[1];}
 for(const [k,v] of Object.entries({space:'view',bounds:'content',animation:'current',text:'balanced'}))ids[k].value=v;
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),documentElement:{style:{setProperty(){}}},events:{},
 querySelectorAll(selector){if(selector==='[data-target]')return nodes.filter(n=>n.dataset.target!==undefined);if(selector==='[data-kind]')return nodes.filter(n=>n.dataset.kind!==undefined);if(selector==='input,select')return nodes.filter(n=>n.tagName==='input'||n.tagName==='select');throw Error('Unknown selector '+selector);},
 addEventListener(k,f,opts){this.events[k]=f;this.eventOptions=opts;}};
 const host={evalScript(script,callback){pending.push({script,callback});},getHostEnvironment(){return JSON.stringify({appSkinInfo:{panelBackgroundColor:{color:{red:35,green:35,blue:35}}}});},addEventListener(...a){themeEvents.push(['add',...a]);},removeEventListener(...a){themeEvents.push(['remove',...a]);}};
 const context={document,window:{__adobe_cep__:host,addEventListener(k,f){windowEvents[k]=f;}},localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn:()=>{timers.delete(id);fn();},ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(base+'/panel.js','utf8'),context);
 const actions=()=>nodes.filter(n=>n.dataset.kind!==undefined),targets=()=>nodes.filter(n=>n.dataset.target!==undefined);
 function reply(raw){pending[pending.length-1].callback(typeof raw==='string'?raw:JSON.stringify(raw));}
 function ready(){reply({ok:true,message:'1 selected'});}
 function args(script=pending[pending.length-1].script){let result;vm.runInNewContext(script,{AlignStudioWheelCall(...a){result=a;}});return result;}
 return {nodes,ids,timers,pending,document,context,host,actions,targets,reply,ready,args,windowEvents,themeEvents};
}
test('balanced text defaults and saved visible-edges mode serialize correctly',()=>{for(const [saved,want]of [[undefined,'balanced'],[{text:'glyph'},'glyph'],[{text:'bad'},'balanced']]){const f=fixture(saved);f.ready();f.actions()[0].onclick();assert.equal(f.args()[2].text,want);}});
test('startup handshake gates actions until success',()=>{const f=fixture();assert(f.actions().every(b=>b.disabled));assert.equal(f.args()[0],'status');f.ready();assert(!f.actions()[0].disabled);assert(f.actions().filter(b=>b.dataset.axis==='2').every(b=>b.disabled));});
test('all 17 actions serialize exact operation mappings',()=>{const f=fixture();f.ready();f.ids.space.value='world';f.ids.space.events.change.call(f.ids.space);assert.equal(f.actions().length,17);for(const b of f.actions()){b.onclick();const [command,op]=f.args();assert.equal(command,'run');assert.equal(op.kind,b.dataset.kind);assert.equal(String(op.axis),b.dataset.axis);assert([0,1,2].includes(op.edge));f.reply({ok:true,message:'done'});}});
test('five targets produce safe expected command target',()=>{const f=fixture();f.ready();for(const b of f.targets()){b.onclick();f.actions()[0].onclick();assert.equal(f.args()[2].target,b.dataset.target);f.reply({ok:true,message:'done'});}});
test('busy lock prevents duplicate mutation dispatch',()=>{const f=fixture();f.ready();f.actions()[0].onclick();const n=f.pending.length;f.actions()[0].onclick();assert.equal(f.pending.length,n);assert(f.ids.refresh.disabled);assert(f.ids.gap.disabled);f.reply({ok:true,message:'done'});assert(!f.ids.refresh.disabled);});
test('empty and malformed host replies invalidate readiness',()=>{for(const raw of ['', 'EvalScript error.','null','{}','{"ok":"true","message":"bad"}']){const f=fixture();f.ready();f.actions()[0].onclick();f.reply(raw);assert(f.actions().every(b=>b.disabled));assert(!f.ids.refresh.disabled);assert.equal(f.ids.status.className,'error');}});
test('failed status invalidates previously ready connection',()=>{const f=fixture();f.ready();f.ids.refresh.onclick();f.reply({ok:false,message:'bridge failed'});assert(f.actions().every(b=>b.disabled));});
test('transport exception releases busy and disables mutation',()=>{const f=fixture();f.ready();f.host.evalScript=()=>{throw Error('transport failed');};f.actions()[0].onclick();assert(f.actions().every(b=>b.disabled));assert(!f.ids.refresh.disabled);assert(f.ids.status.textContent.includes('transport failed'));});
test('timeout preserves in-flight lock and accepts one eventual response',()=>{const f=fixture();f.ready();f.actions()[0].onclick();const callback=f.pending[f.pending.length-1].callback;assert.equal(f.timers.size,1);const timer=[...f.timers.values()][0];assert.equal(timer.ms,60000);timer.fn();assert(f.actions().every(b=>b.disabled));assert(f.ids.refresh.disabled);assert(f.ids.status.textContent.includes('not been cancelled'));const count=f.pending.length;f.ids.refresh.onclick();f.actions()[0].onclick();assert.equal(f.pending.length,count);callback(JSON.stringify({ok:true,message:'late success'}));assert.equal(f.ids.status.textContent,'late success');assert(!f.ids.refresh.disabled);callback(JSON.stringify({ok:false,message:'duplicate'}));assert.equal(f.ids.status.textContent,'late success');f.ids.refresh.onclick();f.ready();assert(!f.actions()[0].disabled);});
test('successful late operation restores usable action buttons',()=>{const f=fixture();f.ready();f.actions()[0].onclick();[...f.timers.values()][0].fn();f.reply({ok:true,message:'Aligned 2 layers.'});assert(!f.actions()[0].disabled,'successful late reply leaves actions disabled without telling user Refresh is required');});
test('valid late operation error releases lock without hiding error',()=>{const f=fixture();f.ready();f.actions()[0].onclick();[...f.timers.values()][0].fn();f.reply({ok:false,message:'Select at least one layer.'});assert(!f.actions()[0].disabled);assert.equal(f.ids.status.className,'error');assert.equal(f.ids.status.textContent,'Select at least one layer.');});
test('unload removes timer and theme listener and ignores late callbacks',()=>{const f=fixture();const callback=f.pending[0].callback;f.windowEvents.unload();assert.equal(f.timers.size,0);assert.equal(f.themeEvents.filter(e=>e[0]==='remove').length,1);const status=f.ids.status.textContent;callback(JSON.stringify({ok:true,message:'late'}));assert.equal(f.ids.status.textContent,status);f.windowEvents.unload();assert.equal(f.themeEvents.filter(e=>e[0]==='remove').length,1);f.ids.refresh.onclick();assert.equal(f.pending.length,1);});
test('invalid saved preferences fall back to valid defaults',()=>{const f=fixture({space:'oops',bounds:'bad',gap:' ',margin:-5,target:'invalid'});f.ready();assert.equal(f.ids.space.value,'view');assert.equal(f.ids.bounds.value,'content');assert.equal(f.ids.gap.value,'24');assert.equal(f.ids.margin.value,'0');f.actions()[0].onclick();assert.equal(f.args()[2].target,'selection');});
test('saved composition target reconciles incompatible World space',()=>{const f=fixture({target:'comp',space:'world',bounds:'source',gap:12,margin:'5'});f.ready();assert.equal(f.ids.space.value,'view');assert.equal(f.ids.bounds.value,'source');assert.equal(f.ids.gap.value,'12');f.actions()[0].onclick();assert.equal(f.args()[2].target,'comp');});
test('all icons retain accessible labels and nonnative hint data',()=>{const f=fixture();for(const b of f.actions().concat(f.targets())){assert(b.dataset.tooltip);assert.equal(b.attributes['aria-label'],b.dataset.tooltip);assert(!b.title);}const css=fs.readFileSync(base+'/panel.css','utf8');assert(css.includes('content:attr(data-tooltip)'));assert(css.includes('pointer-events:none'));});
test('quoted multiline Unicode payload is data, not executable code',()=>{const f=fixture();f.ready();const input='"}); throw Error("injected"); // \\ \n\r\t\u2028\u2029';f.ids.gap.value=input;f.actions()[0].onclick();assert.equal(f.args()[2].gap,input);assert(!/[\u2028\u2029]/.test(f.pending[f.pending.length-1].script));});
test('spacing controls step normally and round directionally with Shift',()=>{
 const f=fixture();f.ready();
 for(const [start,id,shift,want] of [[24,'gapPlus',false,25],[24,'gapMinus',false,23],[24,'gapPlus',true,30],[24,'gapMinus',true,20],[20,'gapPlus',true,30],[20,'gapMinus',true,10],[-24,'gapPlus',true,-20],[-24,'gapMinus',true,-30],[0,'gapMinus',true,-10],[0.2,'gapPlus',false,1.2],[29.99,'gapPlus',true,30]]){
  f.ids.gap.value=String(start);f.ids[id].onclick({shiftKey:shift});assert.equal(f.ids.gap.value,String(want));
 }
 const n=f.pending.length;f.ids.gap.value='bad';f.ids.gapPlus.onclick({});assert.equal(f.ids.gap.value,'bad');assert.equal(f.pending.length,n,'stepping must not mutate AE');
 f.ids.gap.value='24';f.actions()[0].onclick();f.ids.gapPlus.onclick({shiftKey:true});assert.equal(f.ids.gap.value,'24');assert(f.ids.gapPlus.disabled);
});
test('key mode persists without storing a stale layer',()=>{const f=fixture({target:'key'});f.ready();f.actions()[0].onclick();assert.equal(f.args()[2].target,'key');assert(!f.ids.capture);});
test('wheel handler prevents default and preserves all control values',()=>{const f=fixture();f.ready();const original=Object.fromEntries(['gap','margin','space','bounds','animation'].map(id=>[id,f.ids[id].value]));let prevented=0;f.document.events.wheel({deltaY:3,deltaMode:1,ctrlKey:false,preventDefault(){prevented++;}});assert.equal(f.ids.viewport.scrollTop,72);assert.equal(prevented,1);for(const [id,value]of Object.entries(original))assert.equal(f.ids[id].value,value);assert(f.document.eventOptions.capture);assert.equal(f.document.eventOptions.passive,false);});
test('group disables distribution and All keys stays visible',()=>{const f=fixture();f.ready();f.ids.group.checked=true;f.ids.group.events.change.call(f.ids.group);assert(f.actions().filter(b=>b.dataset.kind!=='align').every(b=>b.disabled));f.ids.animation.value='offset';f.ids.animation.events.change.call(f.ids.animation);assert.equal(f.ids.optionsLabel.textContent,'Options: All keys');assert(f.ids.options.hidden);});

function bridgeFixture(){
 function CompItem(){this.selectedLayers=[];this.openInViewer=()=>({setActive(){return true;}});}
 function File(path){this.path=path;this.parent={fsName:'mock/extension/jsx'};}
 const calls=[],engine={run(c,l,op,o){calls.push({c,l,op,o});return {message:'aligned'};}};
 const context={$:{fileName:'mock/extension/jsx/bridge.jsx',global:{AlignStudioWheelEngine:engine},evalFile(){}},File,CompItem,app:{project:{activeItem:new CompItem()},findMenuCommandId(){return -524316;},executeCommand(){}},isValid:l=>l.valid!==false};
 vm.createContext(context);vm.runInContext(fs.readFileSync(base+'/jsx/bridge.jsx','utf8'),context);
 const op={kind:'align',axis:0,edge:0},options={target:'comp',space:'view',bounds:'content',animation:'current',gap:'24',margin:'0'};
 const call=(command,arg=op,o=options)=>JSON.parse(context.$.global.AlignStudioWheelCall(command,arg,o));return {context,calls,call,op,options};
}
test('bridge returns JSON strings for status and successful run',()=>{const f=bridgeFixture();assert.equal(f.call('status').ok,true);assert.equal(f.call('run').message,'aligned');assert.equal(f.calls.length,1);});
test('bridge rejects every invalid command enum without engine mutation',()=>{const f=bridgeFixture();assert.equal(f.call('eval').ok,false);for(const [key,value]of Object.entries({kind:'delete',axis:99,edge:99})){assert.equal(f.call('run',{...f.op,[key]:value}).ok,false);}for(const key of ['target','space','bounds','animation'])assert.equal(f.call('run',f.op,{...f.options,[key]:'invalid'}).ok,false);assert.equal(f.calls.length,0);});
test('automatic key is read fresh from selectedLayers on each operation',()=>{
 const f=bridgeFixture(),c=f.context.app.project.activeItem,a={name:'A',index:9},b={name:'B',index:1};
 c.selectedLayers=[a,b];assert(f.call('run',f.op,{...f.options,target:'key'}).ok);assert.strictEqual(f.calls[0].o.key,a);
 c.selectedLayers=[b,a];assert(f.call('run',f.op,{...f.options,target:'key'}).ok);assert.strictEqual(f.calls[1].o.key,b);
 c.selectedLayers=[a];assert(!f.call('run',f.op,{...f.options,target:'key'}).ok);assert.equal(f.calls.length,2);
});
test('direct viewer focus follows successful mutation without any menu commands',()=>{
 const f=bridgeFixture(),app=f.context.app,events=[];app.project.activeItem.name='Test';
 f.context.$.global.AlignStudioWheelEngine.run=()=>{events.push('run');return {message:'aligned'};};
 app.findMenuCommandId=app.executeCommand=()=>{throw Error('unsafe menu command');};app.project.activeItem.openInViewer=()=>{events.push('open');return {setActive(){events.push('focus');return true;}};};
 assert(f.call('run').ok);assert.deepEqual(events,['run','open','focus']);
});
test('undefined activation return with active viewer is accepted',()=>{
 const f=bridgeFixture(),app=f.context.app;let focused=0;app.findMenuCommandId=()=>0;app.executeCommand=()=>{throw Error('should not execute zero');};
 app.project.activeItem.openInViewer=()=>({active:true,setActive(){focused++;}});
 const r=f.call('run');assert(r.ok);assert.equal(r.message,'aligned');assert.equal(focused,1);assert.equal(f.calls.length,1);
});
test('duplicate composition names avoid ambiguous timeline command',()=>{
 const f=bridgeFixture(),app=f.context.app,c=app.project.activeItem,other=new f.context.CompItem();c.name=other.name='Duplicate';
 app.project.numItems=2;app.project.item=i=>[c,other][i-1];app.findMenuCommandId=()=>{throw Error('ambiguous lookup');};
 c.openInViewer=()=>({setActive(){return true;}});assert.equal(f.call('run').message,'aligned');
});
test('failed viewer activation never claims focus was restored',()=>{
 for(const viewer of [null,{setActive(){return false;}},{setActive(){}}]){const f=bridgeFixture(),app=f.context.app;app.findMenuCommandId=()=>0;app.project.activeItem.openInViewer=()=>viewer;
 const r=f.call('run');assert(r.ok);assert(r.message.includes('Click the timeline'));assert(!r.message.includes('returned to'));}
});
test('focus error reports successful alignment separately and failed alignment never focuses',()=>{
 const f=bridgeFixture(),app=f.context.app;let focus=0;app.project.activeItem.openInViewer=()=>{focus++;throw Error('focus');};
 const r=f.call('run');assert(r.ok);assert(r.message.includes('Click the timeline'));assert.equal(f.calls.length,1);
 f.context.$.global.AlignStudioWheelEngine.run=()=>{throw Error('move failed');};assert(!f.call('run').ok);assert.equal(focus,1);
});
test('bridge catches host exceptions as explicit error envelope',()=>{const f=bridgeFixture();f.context.$.global.AlignStudioWheelEngine.run=()=>{throw Error('Host "error"\nline');};const r=f.call('run');assert.equal(r.ok,false);assert.equal(r.message,'Host "error"\nline');});
test('manifest host bundle is synchronized with engine and bridge sources',()=>{
 const normalize=s=>s.replace(/\r\n/g,'\n').trim();
 const engine=normalize(fs.readFileSync(base+'/jsx/engine.jsx','utf8'));
 const bridge=normalize(fs.readFileSync(base+'/jsx/bridge.jsx','utf8').replace(/^.*\$\.evalFile.*\r?\n/m,''));
 const host=normalize(fs.readFileSync(base+'/jsx/host.jsx','utf8'));
 assert(host.startsWith(engine));assert.equal(normalize(host.slice(engine.length)),bridge);
 assert(fs.readFileSync(base+'/CSXS/manifest.xml','utf8').includes('<ScriptPath>./jsx/host.jsx</ScriptPath>'));
});
test('bundled host initializes without evalFile and returns JSON through captured engine',()=>{
 function CompItem(){this.selectedLayers=[];this.openInViewer=()=>({setActive(){return true;}});}
 const context={$:{global:{},evalFile(){throw Error('Unexpected filesystem loader dependency');}},CompItem,app:{project:{activeItem:new CompItem()},findMenuCommandId(){return -524316;},executeCommand(){}},isValid:l=>l.valid!==false};
 vm.createContext(context);vm.runInContext(fs.readFileSync(base+'/jsx/host.jsx','utf8'),context);
 const call=context.$.global.AlignStudioWheelCall;assert.equal(JSON.parse(call('status')).message,'0 selected');
 context.$.global.AlignStudioWheelEngine.run=()=>({message:'bundled engine called'});
 const r=JSON.parse(call('run',{kind:'align',axis:0,edge:0},{target:'comp',space:'view',bounds:'content',animation:'current',gap:'24',margin:'0'}));
 assert.equal(r.message,'bundled engine called');assert(r.ok);
});
console.log(lines.join('\n')+'\nTOTAL '+lines.filter(l=>l.startsWith('PASS')).length+' passed; '+lines.filter(l=>l.startsWith('FAIL')).length+' failed.\n');


