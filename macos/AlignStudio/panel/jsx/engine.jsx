/* Align Studio 1.0.1 | Original, editable ExtendScript for Adobe After Effects.
   No third-party plugin code or dependencies. */
(function (host) {
    var AS = {}, VERSION = '1.0.1';
    function fail(s) { throw new Error(s); }
    function visual(l) { return (l instanceof AVLayer || l instanceof ShapeLayer || l instanceof TextLayer) && (l.nullLayer || l.hasVideo); }
    function vec(a) { return '[' + a.join(',') + ']'; }
    function add(a,b) { return [a[0]+b[0],a[1]+b[1],(a[2]||0)+(b[2]||0)]; }
    function sub(a,b) { return [a[0]-b[0],a[1]-b[1],(a[2]||0)-(b[2]||0)]; }
    function mul(a,k) { return [a[0]*k,a[1]*k,(a[2]||0)*k]; }
    function inverseParent(parent,s,d) {
        // Sample forward basis: AE's inverse-vector conversion differs for some
        // negative / non-uniform parent scales. Inverting the forward basis is stable.
        var a=s.read('var P=thisComp.layer('+parent.index+'); var origin=P.toWorld([0,0,0]); var x=P.toWorld([1,0,0])-origin,y=P.toWorld([0,1,0])-origin,z=P.toWorld([0,0,1])-origin; [x[0],x[1],x.length>2?x[2]:0,y[0],y[1],y.length>2?y[2]:0,z[0],z[1],z.length>2?z[2]:0].join(",");');
        if(!parent.threeDLayer) {
            var det=a[0]*a[4]-a[3]*a[1];if(Math.abs(det)<1e-9)fail('The parent has zero scale. Restore its scale before aligning.');
            return [(d[0]*a[4]-a[3]*d[1])/det,(a[0]*d[1]-a[1]*d[0])/det,d[2]||0];
        }
        var c0=[a[4]*a[8]-a[5]*a[7],a[5]*a[6]-a[3]*a[8],a[3]*a[7]-a[4]*a[6]];
        var c1=[a[7]*a[2]-a[8]*a[1],a[8]*a[0]-a[6]*a[2],a[6]*a[1]-a[7]*a[0]];
        var c2=[a[1]*a[5]-a[2]*a[4],a[2]*a[3]-a[0]*a[5],a[0]*a[4]-a[1]*a[3]];
        var dt=a[0]*c0[0]+a[1]*c0[1]+a[2]*c0[2];if(Math.abs(dt)<1e-9)fail('The parent has zero scale. Restore its scale before aligning.');
        return [(d[0]*c0[0]+d[1]*c0[1]+d[2]*c0[2])/dt,(d[0]*c1[0]+d[1]*c1[1]+d[2]*c1[2])/dt,(d[0]*c2[0]+d[1]*c2[1]+d[2]*c2[2])/dt];
    }
    function finite(a) { for(var i=0;i<a.length;i++) if(!isFinite(a[i])) fail('The transform cannot be measured. Check zero scale or camera depth.'); return a; }
    function union(items) {
        var b={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]};
        for(var i=0;i<items.length;i++) for(var j=0;j<3;j++) { b.lo[j]=Math.min(b.lo[j],items[i].lo[j]); b.hi[j]=Math.max(b.hi[j],items[i].hi[j]); }
        return b;
    }
    function point(b,axis,edge) { if(edge===0)return b.lo[axis];if(edge===2)return b.hi[axis];return (b.lo[axis]+b.hi[axis])/2; }
    function sampler(comp) {
        var h=comp.layers.addText(''),p;
        try {h.moveToEnd();h.name='__Align Studio temporary measurement__'; h.enabled=false; h.shy=true; h.guideLayer=true;
        p=h.property('ADBE Text Properties').property('ADBE Text Document');}catch(e){h.remove();throw e;}
        return { layer:h, textCache:[], rectCache:[], boundsCache:[], read:function(code) {
            p.expression=code; var s=p.valueAtTime(comp.time,false).text;
            if(p.expressionError) fail('Measurement failed: '+p.expressionError);
            var parts=s.split(','),a=[]; for(var i=0;i<parts.length;i++) a.push(Number(parts[i])); return finite(a);
        }, remove:function(){h.remove();} };
    }
    function checkedRect(r,layer) {
        if(!r||!isFinite(r.left)||!isFinite(r.top)||!isFinite(r.width)||!isFinite(r.height)||r.width<0||r.height<0)
            fail('Cannot measure '+layer.name+'.');
        return {left:r.left,top:r.top,width:r.width,height:r.height};
    }
    function textWarning(opts,layer,reason) {
        if(!opts.textWarnings)opts.textWarnings=[];
        for(var i=0;i<opts.textWarnings.length;i++)if(opts.textWarnings[i].layer===layer)return;
        opts.textWarnings.push({layer:layer,reason:reason});
    }
    function baselineLines(doc) {
        var a=doc.baselineLocs,out=[];
        if(!a||a.length%4)throw Error('baseline data unavailable');
        for(var i=0;i<a.length;i+=4){
            var valid=true;for(var j=0;j<4;j++)if(!isFinite(a[i+j])||Math.abs(a[i+j])>1e20)valid=false;
            // Empty composed lines contain finite FLT_MAX sentinel coordinates.
            if(!valid)continue;
            if(Math.abs(a[i+1]-a[i+3])>0.01)throw Error('non-horizontal baseline');
            out.push(a[i+1]);
        }
        if(!out.length)throw Error('no nonempty baseline');
        return out;
    }
    function balancedTextRect(layer,time,glyph,s,opts) {
        var cache=s.textCache||(s.textCache=[]),i;
        for(i=0;i<cache.length;i++)if(cache[i].layer===layer&&cache[i].time===time)return cache[i].rect;
        var result=glyph,probe=null;
        try {
            var group=layer.property('ADBE Text Properties'),source=group.property('ADBE Text Document');
            var doc=source.valueAtTime(time,false),text=doc.text;
            if(!text||!text.replace(/\s/g,''))throw Error('empty text');
            if(/[^\u0009\u000a\u000d\u0020-\u024f\u2000-\u206f]/.test(text))throw Error('non-Latin typography');
            if(doc.lineOrientation!==undefined&&typeof LineOrientation!=='undefined'&&doc.lineOrientation!==LineOrientation.HORIZONTAL)
                throw Error('vertical text');
            if(layer.threeDPerChar)throw Error('per-character 3D');
            if(doc.smallCaps)throw Error('small caps typography');
            if(doc.boxText&&doc.boxOverflow)throw Error('paragraph overflow');
            var animators=group.property('ADBE Text Animators');
            if(animators&&animators.numProperties)throw Error('text animators');
            var paths=group.property('ADBE Text Path Options'),path=paths?paths.property('ADBE Text Path'):null;
            if(paths&&!path)throw Error('path state unavailable');
            if(path&&Number(path.valueAtTime(time,false))!==0)throw Error('path text');
            if(typeof doc.characterRange!=='function')throw Error('style ranges unavailable');
            var range=doc.characterRange(0,-1),fields=['font','fontSize','horizontalScale','verticalScale','baselineShift','fauxBold','fauxItalic','fontCapsOption','fontBaselineOption'];
            for(i=0;i<fields.length;i++){
                var field=fields[i],value=doc[field];
                if(value!==undefined&&(range[field]===undefined||range[field]!==value))throw Error('mixed character styles');
            }
            // Raised/superscript baselines need a separate explicit policy.
            if(doc.baselineShift!==0)throw Error('shifted baseline');
            if(typeof FontBaselineOption!=='undefined'&&doc.fontBaselineOption!==undefined&&doc.fontBaselineOption!==FontBaselineOption.FONT_NORMAL_BASELINE)
                throw Error('superscript or subscript');
            if(doc.fontObject&&(!range.fontObject||range.fontObject.fontID!==doc.fontObject.fontID))throw Error('mixed font instances');
            var lines=baselineLines(doc);
            for(i=1;i<lines.length;i++)if(lines[i]<lines[i-1])throw Error('nonstandard line order');
            if(doc.fontObject&&typeof doc.fontObject.hasGlyphsFor==='function'&&!doc.fontObject.hasGlyphsFor('H'))throw Error('font lacks Latin cap glyph');
            // This detached TextDocument value is applied only to a scratch layer.
            // The original Source Text, styles, expressions and keys stay untouched.
            doc.text='H';doc.baselineShift=0;doc.applyStroke=false;doc.applyFill=true;
            probe=layer.containingComp.layers.addText('H');probe.moveToEnd();
            probe.name='__Align Studio cap measurement__';probe.enabled=false;probe.shy=true;probe.guideLayer=true;
            var prop=probe.property('ADBE Text Properties').property('ADBE Text Document');
            prop.setValue(doc);
            var measured=prop.valueAtTime(time,false);
            if(measured.boxText)throw Error('probe did not produce point text');
            if(measured.font!==doc.font)throw Error('probe font substituted');
            if(doc.fontObject&&(!measured.fontObject||measured.fontObject.fontID!==doc.fontObject.fontID))throw Error('probe font instance changed');
            var probeLines=baselineLines(measured),r=checkedRect(probe.sourceRectAtTime(time,false),probe);
            var cap=probeLines[0]-r.top;
            if(!isFinite(cap)||cap<=0||cap>1e6)throw Error('cap height unavailable');
            var top=lines[0]-cap,bottom=lines[lines.length-1];
            result=checkedRect({left:glyph.left,top:top,width:glyph.width,height:bottom-top},layer);
        }catch(e){textWarning(opts,layer,e.message||String(e));}
        finally {if(probe)probe.remove();}
        cache.push({layer:layer,time:time,rect:result});
        return result;
    }
    function rect(layer,time,mode,s,opts) {
        var r,isText=layer instanceof TextLayer;
        // Generated text has no footage frame. Its width/height are not a glyph
        // rectangle and lose the negative top/left bearings around the baseline.
        if(mode==='source'&&!isText) return checkedRect({left:0,top:0,width:layer.width,height:layer.height},layer);
        if(mode==='paragraph' && layer instanceof TextLayer) {
            var doc=layer.property('ADBE Text Properties').property('ADBE Text Document').valueAtTime(time,false);
            if(doc.boxText) return checkedRect({left:doc.boxTextPos[0],top:doc.boxTextPos[1],width:doc.boxTextSize[0],height:doc.boxTextSize[1]},layer);
        }
        // includeExtents means paragraph-box bounds for text, not larger glyph
        // bounds. Only the explicit Paragraph box mode should use that box.
        r=layer.sourceRectAtTime(time,mode==='extents'&&!isText);
        r=checkedRect(r,layer);
        if(isText&&opts&&opts.text==='balanced')return balancedTextRect(layer,time,r,s,opts);
        return r;
    }
    function planar(layer) {
        for(var p=layer;p;p=p.parent)if(p.threeDLayer||p.threeDPerChar||p.collapseTransformation)return false;
        return true;
    }
    function bounds(layer,s,opts,worldShift) {
        var time=layer.containingComp.time,key=opts.space+'|'+opts.bounds+'|'+opts.text,cache=s.boundsCache||(s.boundsCache=[]),i;
        var zero=!worldShift||(!worldShift[0]&&!worldShift[1]&&!worldShift[2]);
        if(zero)for(i=0;i<cache.length;i++)if(cache[i].layer===layer&&cache[i].time===time&&cache[i].key===key)return cache[i].value;
        // A pure 2D ancestry has an affine screen translation. Keep perspective
        // and collapsed transforms on the original expression/Newton path.
        if(!zero&&opts.space==='view'&&planar(layer)){
            var original=bounds(layer,s,opts),translated={lo:original.lo.slice(0),hi:original.hi.slice(0)};
            for(i=0;i<3;i++){translated.lo[i]+=worldShift[i]||0;translated.hi[i]+=worldShift[i]||0;}return translated;
        }
        var rc=s.rectCache||(s.rectCache=[]),r=null;
        for(i=0;i<rc.length;i++)if(rc[i].layer===layer&&rc[i].time===time&&rc[i].key===key){r=rc[i].value;break;}
        if(!r){r=layer.nullLayer?{left:0,top:0,width:0,height:0}:rect(layer,time,opts.bounds,s,opts);rc.push({layer:layer,time:time,key:key,value:r});}
        var x=r.left,y=r.top,w=r.width,h=r.height;
        var pts=[[x,y,0],[x+w,y,0],[x+w,y+h,0],[x,y+h,0]];
        // Nulls use their full animated anchor, including Z, rather than source squares.
        var points=layer.nullLayer?'[L.anchorPoint,L.anchorPoint,L.anchorPoint,L.anchorPoint]':'['+vec(pts[0])+','+vec(pts[1])+','+vec(pts[2])+','+vec(pts[3])+']';
        var code='var L=thisComp.layer('+layer.index+'); var P='+points+'; var d='+vec(worldShift||[0,0,0])+'; var out=[]; for(var i=0;i<4;i++){var q=L.toWorld(P[i])+d;';
        code+=opts.space==='world'?'var v=q;':'if('+!!layer.threeDLayer+' && thisComp.activeCamera && thisComp.activeCamera.fromWorld(q)[2]<=0.01) throw new Error("Layer crosses or sits behind the camera plane"); var v=L.toComp(L.fromWorld(q));';
        code+='out.push(v[0],v[1],v.length>2?v[2]:0);} out.join(",");';
        var a=s.read(code), b={lo:[Infinity,Infinity,Infinity],hi:[-Infinity,-Infinity,-Infinity]};
        for(i=0;i<4;i++) for(var j=0;j<3;j++) {b.lo[j]=Math.min(b.lo[j],a[i*3+j]);b.hi[j]=Math.max(b.hi[j],a[i*3+j]);} if(zero)cache.push({layer:layer,time:time,key:key,value:b});return b;
    }
    function basis(layer,s,opts) {
        if(opts.space==='world'||!layer.threeDLayer) return [[1,0,0],[0,1,0],[0,0,1]];
        var a=s.read('var C=thisComp.activeCamera; var a=[1,0,0],b=[0,1,0],c=[0,0,1]; if(C){var o=C.toWorld([0,0,0]);a=normalize(C.toWorld([1,0,0])-o);b=normalize(C.toWorld([0,1,0])-o);c=normalize(C.toWorld([0,0,1])-o);} [a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]].join(",");');
        return [[a[0],a[1],a[2]],[a[3],a[4],a[5]],[a[6],a[7],a[8]]];
    }
    function solve(layer,s,opts,original,desired,features) {
        if(planar(layer))return [desired[0],desired[1],0];
        var d=[0,0,0],bs=basis(layer,s,opts),i,j;
        // Newton solve against virtual world translations; no user property is changed.
        for(i=0;i<12;i++) {
            var b=bounds(layer,s,opts,d), ex=desired[0]-(point(b,0,features[0])-point(original,0,features[0])), ey=desired[1]-(point(b,1,features[1])-point(original,1,features[1]));
            if(Math.abs(ex)+Math.abs(ey)<0.005) return d;
            var bx=bounds(layer,s,opts,add(d,bs[0])),by=bounds(layer,s,opts,add(d,bs[1]));
            var a=point(bx,0,features[0])-point(b,0,features[0]),c=point(bx,1,features[1])-point(b,1,features[1]),bb=point(by,0,features[0])-point(b,0,features[0]),dd=point(by,1,features[1])-point(b,1,features[1]),det=a*dd-bb*c;
            if(Math.abs(det)<1e-9) fail('Cannot align '+layer.name+': its projected transform is singular.');
            d=add(d,add(mul(bs[0],(ex*dd-bb*ey)/det),mul(bs[1],(a*ey-ex*c)/det)));
            finite(d);
        }
        fail('Could not converge for '+layer.name+'. No layers were moved.');
    }
    function posProps(layer) {
        var p=layer.property('ADBE Transform Group').property('ADBE Position'),out=[];
        if(p.dimensionsSeparated) {for(var i=0;i<(layer.threeDLayer?3:2);i++) out.push(p.getSeparationFollower(i));} else out.push(p);
        return out;
    }
    function measurable(layer) {
        if(!visual(layer)) fail('Select visual layers or nulls. Cameras and lights are not alignment objects.');
        if(layer.collapseTransformation && layer.source instanceof CompItem) fail('Collapsed precompositions need rendered bounds. Turn off Collapse Transformations on '+layer.name+'.');
    }
    function validate(layer) {
        measurable(layer);
        if(layer.locked) fail('Unlock '+layer.name+' before aligning.');
        var ps=posProps(layer);for(var i=0;i<ps.length;i++) if(ps[i].expressionEnabled) {
            if(!ps[i].canSetExpression)fail('Position expression on '+layer.name+' cannot be edited.');
            if(ps[i].expressionError)fail('Fix the Position expression error on '+layer.name+' before aligning.');
        }
        if(layer.autoOrient!==AutoOrientType.NO_AUTO_ORIENT) fail('Turn off Auto-Orient on '+layer.name+' before aligning.');
    }
    function expressionString(source) {
        return '"'+String(source).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';
    }
    function offsetNumbers(delta) {
        var values=typeof delta==='number'?[delta]:delta,out=[];
        if(!values||values.length<1||values.length>3)fail('Invalid expression offset dimensions.');
        for(var i=0;i<values.length;i++){if(typeof values[i]!=='number'||!isFinite(values[i])||Math.abs(values[i])>1e12)fail('Expression offset is outside the supported range.');out.push(values[i]===0?0:values[i]);}
        return out;
    }
    function expressionWrapper(base,values,scalar) {
        var literal=scalar?String(values[0]):'['+values.join(',')+']';
        // eval preserves the completion value of statements/conditionals. A local
        // scope isolates original variable names; AE add() handles Property values
        // and scalar/vector addition in both expression engines.
        return '// AlignStudioPosition/v1|'+(scalar?'s':'v')+'|'+values.join(',')+'|'+encodeURIComponent(base)+'\n'+
            'add((function(){return eval('+expressionString(base)+');}).call(this),'+literal+');';
    }
    function offsetExpression(source,delta) {
        source=String(source);var scalar=typeof delta==='number',values=offsetNumbers(delta),base=source;
        var m=/^\/\/ AlignStudioPosition\/v1\|([sv])\|([^|\n]+)\|([^\n]*)\n/.exec(source),collapse=null;
        if(m)try{
            var priorBase=decodeURIComponent(m[3]),pieces=m[2].split(','),previous=[];
            for(var i=0;i<pieces.length;i++){if(!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(pieces[i]))throw Error('invalid metadata');previous.push(Number(pieces[i]));}
            previous=offsetNumbers(previous);
            // Never trust a marker alone: user-edited wrapper bodies are preserved.
            if((m[1]==='s')===scalar&&previous.length===values.length&&expressionWrapper(priorBase,previous,scalar)===source){
                collapse={base:priorBase,values:previous};
            }
        }catch(ignore){}
        if(collapse){var combined=[];for(var k=0;k<values.length;k++)combined.push(values[k]+collapse.values[k]);values=offsetNumbers(combined);base=collapse.base;}
        if(base.length>65536)fail('Position expression is too long to offset safely.');
        var zero=true;for(var j=0;j<values.length;j++)if(Math.abs(values[j])>=1e-10)zero=false;
        var result=zero?base:expressionWrapper(base,values,scalar);
        if(result.length>262144)fail('Wrapped Position expression is too long.');
        return result;
    }
    function changes(layer,delta,time,animation) {
        var ps=posProps(layer),out=[];
        for(var i=0;i<ps.length;i++) {
            var p=ps[i],d=ps.length===1?delta:delta[i];
            if(ps.length>1?Math.abs(d)<1e-8:Math.abs(d[0])+Math.abs(d[1])+(Math.abs(d[2])||0)<1e-8) continue;
            if(p.expressionEnabled){
                var evaluated=p.valueAtTime(time,false),ed;
                if(p.expressionError)fail('Fix the Position expression error on '+layer.name+' before aligning.');
                if(ps.length>1){if(typeof evaluated!=='number'||!isFinite(evaluated))fail('Cannot evaluate Position on '+layer.name+'.');ed=d;}
                else {if(!evaluated||(layer.threeDLayer?evaluated.length!==3:(evaluated.length!==2&&evaluated.length!==3)))fail('Invalid Position expression dimensions on '+layer.name+'.');ed=[];for(var e=0;e<evaluated.length;e++){if(!isFinite(evaluated[e]))fail('Invalid Position expression result.');ed.push(!layer.threeDLayer&&e===2?0:d[e]);}}
                out.push({p:p,kind:'expression',old:p.expression,oldEnabled:p.expressionEnabled,value:offsetExpression(p.expression,ed),time:time});
                continue;
            }
            function shifted(v) { if(typeof v==='number') return v+d;var a=[];for(var j=0;j<v.length;j++) a.push(v[j]+d[j]);return a; }
            if(p.numKeys && animation==='offset') for(var k=1;k<=p.numKeys;k++) out.push({p:p,key:k,old:p.keyValue(k),value:shifted(p.keyValue(k)),kind:'key'});
            else if(p.numKeys) {
                var n=p.nearestKeyIndex(time),has=Math.abs(p.keyTime(n)-time)<1e-7;
                out.push({p:p,key:n,old:has?p.keyValue(n):null,value:shifted(p.valueAtTime(time,true)),kind:has?'key':'new',time:time});
            } else out.push({p:p,old:p.value,value:shifted(p.value),kind:'value'});
        } return out;
    }
    function apply(c,reverse) {
        var v=reverse?c.old:c.value;
        if(c.kind==='expression'){
            c.p.expression=v;c.p.expressionEnabled=reverse?c.oldEnabled:true;
            if(!reverse){c.p.valueAtTime(c.time,false);if(c.p.expressionError||!c.p.expressionEnabled)fail('The Position expression could not be offset. The operation was reverted.');}
        }else if(c.kind==='value')c.p.setValue(v);
        else if(c.kind==='key')c.p.setValueAtKey(c.key,v);
        else if(reverse){if(c.p.numKeys){var n=c.p.nearestKeyIndex(c.time);if(Math.abs(c.p.keyTime(n)-c.time)<1e-7)c.p.removeKey(n);}}
        else c.p.setValueAtTime(c.time,v);
    }
    AS.run=function(comp,layers,op,options) {
        var o=options||{}, opts={target:o.target||'selection',space:o.space||'view',bounds:o.bounds||'content',text:o.text||'balanced',textWarnings:[],group:!!o.group,animation:o.animation||'current',gap:o.gap===undefined?24:Number(o.gap),margin:o.margin===undefined?0:Number(o.margin),key:o.key};
        if(opts.text!=='balanced'&&opts.text!=='glyph')fail('Invalid text alignment mode.');
        if(!(comp instanceof CompItem)) fail('Open a composition and select layers.');
        if(!layers||!layers.length) fail('Select at least one layer.');
        if((o.margin!==undefined && String(o.margin).replace(/\s/g,'')==='')||!isFinite(opts.margin)||opts.margin<0) fail('Inset must be a non-negative number.');
        if((o.gap!==undefined && String(o.gap).replace(/\s/g,'')==='')||!isFinite(opts.gap)) fail('Gap must be a number. Negative values create overlap.');
        var axis=op.axis||0,edge=op.edge||0,kind=op.kind||'align',i,j,items=[],selected=comp.selectedLayers.slice(0),s=null,all=[],applied=[];
        if(axis===2 && opts.space!=='world') fail('Depth commands use World space.');
        if(kind!=='align'&&layers.length<2) fail('Select two or more layers to distribute.');
        if(kind!=='align'&&opts.group) fail('Turn off Move as group to distribute layers.');
        for(i=0;i<layers.length;i++) {if(opts.target!=='key'||layers[i]!==opts.key)validate(layers[i]); if(axis===2&&!layers[i].threeDLayer) fail('Depth alignment requires only 3D layers.');}
        if(opts.target==='key'&&!opts.key) fail('Select a key layer first, then add the other layers.');
        if(opts.target==='key'){try{if(!isValid(opts.key))fail('The key layer no longer exists. Select the layers again.');}catch(invalidKey){fail('The key layer no longer exists. Select the layers again.');}}
        if(opts.target==='key'&&opts.key.containingComp!==comp) fail('The key belongs to another composition. Select the layers again.');
        if(opts.target==='key') {
            measurable(opts.key);
            var kp=opts.key.parent;while(kp){for(i=0;i<layers.length;i++)if(layers[i]===kp)fail('The key is parented to a selected layer. Deselect its ancestors to keep the key fixed.');kp=kp.parent;}
        }
        if(opts.space==='world'&&opts.target!=='selection'&&opts.target!=='key') fail('World space uses Selection or Key layer as its target.');
        app.beginUndoGroup('Align Studio - '+kind);
        try {
            s=sampler(comp);
            for(i=0;i<layers.length;i++) items.push({layer:layers[i],b:bounds(layers[i],s,opts),delta:[0,0,0],world:[0,0,0]});
            var boxes=[];for(i=0;i<items.length;i++) boxes.push(items[i].b);
            var total=union(boxes),target=total;
            if(opts.target==='key') target=bounds(opts.key,s,opts);
            else if(opts.target!=='selection') {
                var pct=0;if(opts.target==='action')pct=0.05;if(opts.target==='title')pct=0.1;
                var mx=comp.width*pct+opts.margin,my=comp.height*pct+opts.margin;
                if(mx*2>=comp.width||my*2>=comp.height) fail('Inset leaves no usable composition area.');
                target={lo:[mx,my,0],hi:[comp.width-mx,comp.height-my,0]};
            }
            var moving=[];for(i=0;i<items.length;i++) if(opts.target!=='key'||items[i].layer!==opts.key)moving.push(items[i]);
            if(!moving.length) fail('Select at least one layer other than the key layer.');
            if(kind==='align') {
                var groupBoxes=[];for(i=0;i<moving.length;i++)groupBoxes.push(moving[i].b);var gb=union(groupBoxes);
                for(i=0;i<moving.length;i++) moving[i].delta[axis]=point(target,axis,edge)-point(opts.group?gb:moving[i].b,axis,edge);
            } else {
                items.sort(function(a,b){return point(a.b,axis,1)-point(b.b,axis,1)||a.layer.index-b.layer.index;});
                var n=items.length,start=target.lo[axis],end=target.hi[axis],sizes=0,gap=opts.gap;
                for(i=0;i<n;i++)sizes+=items[i].b.hi[axis]-items[i].b.lo[axis];
                if(kind==='gaps') gap=(end-start-sizes)/(n-1);
                if(kind==='centers') {
                    start=opts.target==='selection'?point(items[0].b,axis,1):target.lo[axis];
                    end=opts.target==='selection'?point(items[n-1].b,axis,1):target.hi[axis];
                    for(i=0;i<n;i++)items[i].delta[axis]=start+i*(end-start)/(n-1)-point(items[i].b,axis,1);
                } else {var cursor=start;for(i=0;i<n;i++){items[i].delta[axis]=cursor-items[i].b.lo[axis];cursor+=items[i].b.hi[axis]-items[i].b.lo[axis]+gap;}}
                // The first selected key remains fixed; translate the entire result to its original location.
                if(opts.target==='key') {var shift=null;for(i=0;i<n;i++)if(items[i].layer===opts.key)shift=items[i].delta[axis];if(shift===null)fail('For distribution, include the key in your selection.');for(i=0;i<n;i++)items[i].delta[axis]-=shift;}
            }
            var features=[1,1,1];features[axis]=0;if(kind==='align')features[axis]=edge;if(kind==='centers')features[axis]=1;
            var converged=false;
            for(var iteration=0;iteration<20;iteration++) {
                for(i=0;i<items.length;i++) {
                    var it=items[i];it.world=opts.space==='world'?it.delta:solve(it.layer,s,opts,it.b,it.delta,features);
                    it.finalB=bounds(it.layer,s,opts,it.world);
                }
                if(kind==='align'||kind==='centers'||opts.space==='world'){converged=true;break;}
                // Recompute edge spacing from predicted projected widths. Tilting and perspective
                // can change those widths when a layer moves parallel to the camera plane.
                var sum=0;for(i=0;i<items.length;i++)sum+=items[i].finalB.hi[axis]-items[i].finalB.lo[axis];
                var spacing=kind==='gaps'?(target.hi[axis]-target.lo[axis]-sum)/(items.length-1):opts.gap;
                var cur=target.lo[axis],next=[],keyShift=0,error=0;
                for(i=0;i<items.length;i++){next[i]=cur-items[i].b.lo[axis];cur+=items[i].finalB.hi[axis]-items[i].finalB.lo[axis]+spacing;if(opts.target==='key'&&items[i].layer===opts.key)keyShift=next[i];}
                for(i=0;i<items.length;i++){next[i]-=keyShift;error=Math.max(error,Math.abs(next[i]-items[i].delta[axis]));}
                if(error<0.005){converged=true;break;}
                for(i=0;i<items.length;i++)items[i].delta[axis]=next[i];
            }
            if(!converged)fail('Perspective spacing did not converge. Try smaller gaps or World space. No layers were moved.');
            // Compensate descendants for planned ancestor translation; never detach parents.
            for(i=0;i<items.length;i++) {
                var item=items[i],ancestor=item.layer.parent,inherited=[0,0,0],found=false;
                while(ancestor&&!found) {for(j=0;j<items.length;j++)if(items[j].layer===ancestor){inherited=items[j].world;found=true;break;} ancestor=ancestor.parent;}
                var wd=sub(item.world,inherited),local=wd;
                if(item.layer.parent) local=inverseParent(item.layer.parent,s,wd);
                var cc=changes(item.layer,local,comp.time,opts.animation);for(j=0;j<cc.length;j++)all.push(cc[j]);
            }
            s.remove();s=null;
            for(i=0;i<all.length;i++){applied.push(all[i]);apply(all[i],false);}
            // Verify the actual host result, including expression-driven dependencies.
            // A dependent rig that changes geometry mid-command is rolled back.
            s=sampler(comp);
            for(i=0;i<items.length;i++) {
                var actual=bounds(items[i].layer,s,opts),expected=items[i].finalB;
                for(j=0;j<(opts.space==='world'?3:2);j++)if(Math.abs(actual.lo[j]-expected.lo[j])>0.05||Math.abs(actual.hi[j]-expected.hi[j])>0.05)fail('A dependent transform changed '+items[i].layer.name+' during alignment. The operation was reverted.');
            }
            if(opts.target==='key'){var actualKey=bounds(opts.key,s,opts);for(j=0;j<(opts.space==='world'?3:2);j++)if(Math.abs(actualKey.lo[j]-target.lo[j])>0.05||Math.abs(actualKey.hi[j]-target.hi[j])>0.05)fail('The key depends on a moved layer. The operation was reverted.');}
            s.remove();s=null;
            var note='';if(opts.textWarnings.length){note=' Glyph bounds used for '+opts.textWarnings.length+' unsupported text layer(s): ';for(i=0;i<opts.textWarnings.length;i++){if(i)note+='; ';note+=opts.textWarnings[i].layer.name+' ('+opts.textWarnings[i].reason+')';}note+='.';}
            var expressions=0;for(i=0;i<all.length;i++)if(all[i].kind==='expression')expressions++;
            if(expressions)note+=' Expression Position offsets apply continuously at all times; base keyframes are unchanged.';
            return {count:moving.length,message:(kind==='align'?'Aligned ':'Distributed ')+moving.length+' layer'+(moving.length===1?'':'s')+'. Undo with Ctrl/Cmd+Z.'+note};
        } catch(e) {
            var rollback='';for(i=applied.length-1;i>=0;i--)try{apply(applied[i],true);}catch(re){rollback=' Use Undo to restore the operation.';}
            throw new Error(e.toString()+rollback);
        } finally {
            if(s)try{s.remove();}catch(ignore){}
            var currentSelection=comp.selectedLayers;
            for(i=0;i<currentSelection.length;i++)try{currentSelection[i].selected=false;}catch(ignore2){}
            for(i=0;i<selected.length;i++)try{selected[i].selected=true;}catch(ignore3){}
            app.endUndoGroup();
        }
    };
    AS.bounds=bounds;AS.sampler=sampler;AS.offsetExpression=offsetExpression;AS.version=VERSION;
    $.global.AlignStudioWheelEngine=AS;
})(this);

