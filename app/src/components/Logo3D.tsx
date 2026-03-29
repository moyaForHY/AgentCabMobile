import React from 'react'
import { View } from 'react-native'
import { WebView } from 'react-native-webview'

type Props = {
  size?: number
  pointCount?: number
  signalCount?: number
  color?: string
  glow?: boolean
}

export default function Logo3D({
  size = 52,
  pointCount = 200,
  signalCount = 6,
  color = '37, 99, 235',
  glow = false,
}: Props) {
  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=${size},initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;overflow:hidden;touch-action:none}html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}canvas{display:block}</style>
</head><body><canvas id="c" width="${size}" height="${size}"></canvas><script>
var PI=Math.PI,S=${size},pc=${pointCount},sc=${signalCount},col="${color}",G=${glow};
var GR=100;
function sL(ch){var t=document.createElement("canvas");t.width=GR;t.height=GR;var c=t.getContext("2d");
c.fillStyle="#000";c.fillRect(0,0,GR,GR);c.fillStyle="#fff";
c.font="900 "+(GR*0.75)+"px Arial";c.textAlign="center";c.textBaseline="middle";
c.fillText(ch,GR/2,GR/2);var d=c.getImageData(0,0,GR,GR).data;
return{h:function(x,y){return x>=0&&x<GR&&y>=0&&y<GR&&d[(y*GR+x)*4]>128}}}
var cv=document.getElementById("c"),ctx=cv.getContext("2d"),mA=sL("A"),mC=sL("C");

// Generate points inside A∩C volume
var pts=[],md=2/Math.sqrt(pc)*0.8,at=0;
while(pts.length<pc&&at<pc*80){at++;
var x=Math.random()*GR,y=Math.random()*GR,z=Math.random()*GR;
if(mA.h(Math.floor(x),Math.floor(y))&&mC.h(Math.floor(z),Math.floor(y))){
var nx=(x/GR-.5)*2,ny=(y/GR-.5)*2,nz=(z/GR-.5)*2,tc=false;
for(var i=Math.max(0,pts.length-50);i<pts.length;i++){
var dx=pts[i].x-nx,dy=pts[i].y-ny,dz=pts[i].z-nz;
if(dx*dx+dy*dy+dz*dz<md*md){tc=true;break}}
if(!tc)pts.push({x:nx,y:ny,z:nz,ox:x,oy:y,oz:z,pp:Math.random()*PI*2})}}

// Check if a point (in grid space) is inside the letter masks
function inShape(gx,gy,gz){
return mA.h(Math.floor(gx),Math.floor(gy))&&mC.h(Math.floor(gz),Math.floor(gy))}

// Build neighbors — only connect if midpoint is also inside shape
var ND=md*2.2,nb=pts.map(function(){return[]});
for(var i=0;i<pts.length;i++){for(var j=i+1;j<pts.length;j++){
var dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,dz=pts[i].z-pts[j].z;
var dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
if(dist<ND){
// Check midpoint is inside shape
var mx=(pts[i].ox+pts[j].ox)/2,my=(pts[i].oy+pts[j].oy)/2,mz=(pts[i].oz+pts[j].oz)/2;
if(inShape(mx,my,mz)){nb[i].push(j);nb[j].push(i)}}}}

var sigs=[];
function sp(){for(var a=0;a<30;a++){var i=Math.floor(Math.random()*pts.length);
if(nb[i].length>0){sigs.push({f:i,t:nb[i][Math.floor(Math.random()*nb[i].length)],p:0,
s:.015+Math.random()*.01,h:4+Math.floor(Math.random()*6)});return}}}
for(var i=0;i<sc;i++)sp();

var tm=0,rY=0,hs=S/2,sc2=S*.38;
function pj(p,r){var c=Math.cos(r),s=Math.sin(r),rx=p.x*c-p.z*s,rz=p.x*s+p.z*c,
f=3,k=f/(f+rz);return{sx:hs+rx*sc2*k,sy:hs+p.y*sc2*k,d:rz,k:k}}

function draw(){tm++;rY+=.004;ctx.clearRect(0,0,S,S);
var pr=pts.map(function(p,i){var r=pj(p,rY);return{sx:r.sx,sy:r.sy,d:r.d,k:r.k,i:i,p:p}});
pr.sort(function(a,b){return a.d-b.d});
var pm={};pr.forEach(function(p){pm[p.i]=p});

// Draw connections
var dn={};
pr.forEach(function(o){nb[o.i].forEach(function(j){
var key=o.i<j?o.i+"-"+j:j+"-"+o.i;if(dn[key])return;dn[key]=1;
var p2=pm[j];if(!p2)return;
var df=.2+.8*((o.d+p2.d+2)/4);
ctx.strokeStyle="rgba("+col+","+(0.15*df)+")";
ctx.lineWidth=.5*((o.k+p2.k)/2);
ctx.beginPath();ctx.moveTo(o.sx,o.sy);ctx.lineTo(p2.sx,p2.sy);ctx.stroke()})});

// Draw signals
var al=[];sigs.forEach(function(s){s.p+=s.s;
if(s.p>=1){var n=nb[s.t];
if(s.h>0&&n.length>0)al.push({f:s.t,t:n[Math.floor(Math.random()*n.length)],p:0,
s:.015+Math.random()*.01,h:s.h-1});else sp()}
else{al.push(s);var fp=pts[s.f],tp=pts[s.t];
var ip={x:fp.x+(tp.x-fp.x)*s.p,y:fp.y+(tp.y-fp.y)*s.p,z:fp.z+(tp.z-fp.z)*s.p,pp:0};
var r=pj(ip,rY);
if(G){var sz=(4+Math.sin(s.p*PI)*2)*r.k;var g=ctx.createRadialGradient(r.sx,r.sy,0,r.sx,r.sy,sz);
g.addColorStop(0,"rgba("+col+",0.9)");g.addColorStop(.5,"rgba("+col+",0.3)");
g.addColorStop(1,"rgba("+col+",0)");ctx.fillStyle=g;ctx.fillRect(r.sx-sz,r.sy-sz,sz*2,sz*2)}
else{ctx.fillStyle="rgba("+col+",0.9)";ctx.beginPath();ctx.arc(r.sx,r.sy,2*r.k,0,PI*2);ctx.fill()}}});
sigs.length=0;sigs.push.apply(sigs,al);while(sigs.length<sc)sp();

// Draw nodes
pr.forEach(function(o){var pulse=Math.sin(tm*.02+o.p.pp)*.5+.5,df=.3+.7*((o.d+1)/2);
var r=(1.5+pulse*.5)*o.k;
if(G){var g=ctx.createRadialGradient(o.sx,o.sy,0,o.sx,o.sy,r*3);
g.addColorStop(0,"rgba("+col+","+(0.2*pulse*df)+")");g.addColorStop(1,"rgba("+col+",0)");
ctx.fillStyle=g;ctx.fillRect(o.sx-r*3,o.sy-r*3,r*6,r*6)}
ctx.fillStyle="rgba("+col+","+((.45+pulse*.35)*df)+")";
ctx.beginPath();ctx.arc(o.sx,o.sy,r,0,PI*2);ctx.fill()});

requestAnimationFrame(draw)}draw();
</script></body></html>`

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} pointerEvents="none">
      <WebView
        source={{ html }}
        style={{ width: size, height: size, backgroundColor: 'transparent', opacity: 0.99 }}
        scrollEnabled={false}
        overScrollMode="never"
        nestedScrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        setBuiltInZoomControls={false}
        javaScriptEnabled={true}
        originWhitelist={['*']}
        androidLayerType="hardware"
      />
    </View>
  )
}
