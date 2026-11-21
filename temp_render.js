/* ================= 自定义字体配置 ================= */

function customRenderUI(){
  var box=document.getElementById('custBox');
  if(!box) return;
  var o=customGet();
  var html='';
  html+='<div class="tlabel">自定义主题</div>';
  html+='<div class="custRow"><label class="custSw"><input type="checkbox" id="custOn"'+(THEME.custom?' checked':'')+'> 启用自定义主题</label></div>';
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    var f=CUSTOM_FIELDS[i];
    html+='<div class="custRow">'+
      '<span class="custName">'+f.n+'</span>'+
      '<input type="color" class="custPick" id="cust_'+f.k+'" value="'+o.ui[f.k]+'">'+
      '<input type="text" class="custHex" id="custHex_'+f.k+'" value="'+o.ui[f.k]+'" maxlength="7" spellcheck="false">'+
      '</div>';
  }
  html+='<div class="custRow"><span class="custName">预设</span><div class="custPresets">';
  html+='<div class="custLabel">字体</div>';
  html+='<div class="custRow"><span class="custName">字体族</span><div class="custFonts">';
  for(var fi=0;fi<FONT_ORDER.length;fi++){
    var fk=FONT_ORDER[fi];
    html+='<button type="button" data-cft='+fk+' class='+(o.font.family===fk?'on':'')+'>'+FONT_FAMILY[fk].name+'</button>';
  }
  html+='</div></div>';
  var sizeKeys=['title','body','btn'];
  for(var si=0;si<sizeKeys.length;si++){
    var sk=sizeKeys[si]; var lim=FONT_LIMITS[sk];
    html+='<div class="custRow"><span class="custName">'+lim.n+'</span>'
      +'<input type="range" class="custRange" id="custFs_'+sk+'" min='+lim.min+' max='+lim.max+' step='+lim.step+' value='+o.font[sk]+'>'
      +'<span class="custVal" id="custFv_'+sk+'">'+o.font[sk]+'</span></div>';
  }
  html+='<div class="custRow"><span class="custName">预设</span><div class="custPresets">';
  html+='<button data-cp="dark">深色</button>';
  html+='<button data-cp="light">浅色</button>';
  html+='<button data-cp="green">终端绿</button>';
  html+='<button data-cp="sunset">暖橙</button>';
  html+='<button data-cp="cyber">赛博紫</button>';
  html+='</div></div>';
  html+='<div class="custRow">'+
    '<button id="custCopy">复制配置</button>'+
    '<button id="custExport">导出文件</button>'+
    '<button id="custImport">导入</button>'+
    '<button id="custReset2" class="danger">重置</button></div>';
  html+='<textarea id="custIOText" class="custIO" placeholder="点「复制配置」会把 JSON 放这里；也可以粘贴别人的配置后点「导入」"></textarea>';
  box.innerHTML=html;
  customBindUI();
}