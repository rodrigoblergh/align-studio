(function () {
    $.evalFile(new File(new File($.fileName).parent.fsName + '/engine.jsx'));
    var engine=$.global.AlignStudioWheelEngine;
    function quote(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t').replace(/[\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
    function reply(ok,s){return '{"ok":'+ok+',"message":'+quote(s)+'}';}
    function one(v,values){for(var i=0;i<values.length;i++)if(v===values[i])return;throw Error('Invalid command option.');}
    function focusComposition(c){
        // Dynamic Window-menu IDs are not stable commands: executing one can
        // close a composition tab. Only the direct Viewer API is safe here.
        var viewer=c.openInViewer();
        if(!viewer)return false;
        var activated=viewer.setActive();
        return activated===true||viewer.active===true;
    }
    $.global.AlignStudioWheelCall=function(command,op,o){try{
        var c=app.project.activeItem, layers=c instanceof CompItem?c.selectedLayers:[];
        if(command==='status')return reply(true,layers.length+' selected');
        one(command,['run']);one(op.kind,['align','centers','gaps','fixed']);one(op.axis,[0,1,2]);one(op.edge,[0,1,2]);
        one(o.target,['selection','comp','action','title','key']);one(o.space,['view','world']);one(o.bounds,['content','extents','paragraph','source']);one(o.animation,['current','offset']);
        one(o.text===undefined?'balanced':o.text,['balanced','glyph']);
        if(o.target==='key'){
            if(layers.length<2)throw Error('Select the key layer first, then add at least one other layer.');
            o.key=layers[0];
        }
        var result=engine.run(c,layers,op,o);
        // The engine has restored selection and closed its Undo group here.
        try{if(!focusComposition(c))result.message+=' Click the timeline to use Undo.';}
        catch(focusError){result.message+=' Click the timeline to use Undo.';}
        return reply(true,result.message);
    }catch(e){return reply(false,e.message||e.toString());}};
})();
