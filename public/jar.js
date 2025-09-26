// jar.js - 支援多實例（每個 canvas 一個罐）
const Jar = (() => {

  function create(canvas){
    const ctx = canvas.getContext('2d');
    let W=0, H=0;
    const tokens = [];
    const gravity = 0.45, bounce = 0.45, friction = 0.99;
    const tokenR = Number(opts.radius) || 34; // ← 預設放大
    let jar = { x:0, y:0, w:0, h:0, r:22 };

    function resize(){
      const r = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * r;
      canvas.height = canvas.clientHeight * r;
      ctx.setTransform(r,0,0,r,0,0);
      W = canvas.clientWidth; H = canvas.clientHeight;
      const m = 30; jar = { x:m, y:m, w: W-2*m, h: H-2*m, r:22 };
    }

    function drawJar(){
      ctx.save();
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(200,220,255,.5)";
      const {x,y,w,h,r} = jar;
      ctx.beginPath();
      ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
      ctx.quadraticCurveTo(x+w, y, x+w, y+r);
      ctx.lineTo(x+w, y+h-r);
      ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
      ctx.lineTo(x+r, y+h);
      ctx.quadraticCurveTo(x, y+h, x, y+h-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.stroke(); ctx.restore();
    }

    function step(){
      ctx.clearRect(0,0,W,H);
      drawJar();
      for (let i=0;i<tokens.length;i++){
        const t = tokens[i];
        t.vy += gravity; t.vx *= friction; t.x += t.vx; t.y += t.vy;
        if (t.x - t.r < jar.x+6){ t.x = jar.x+6 + t.r; t.vx *= -bounce; }
        if (t.x + t.r > jar.x+jar.w-6){ t.x = jar.x+jar.w-6 - t.r; t.vx *= -bounce; }
        if (t.y + t.r > jar.y+jar.h-6){ t.y = jar.y+jar.h-6 - t.r; t.vy *= -bounce; if (Math.abs(t.vy)<0.8) t.vy=0; }
        if (t.y - t.r < jar.y+6){ t.y = jar.y+6 + t.r; t.vy *= -bounce; }
        for (let j=i+1;j<tokens.length;j++){
          const o = tokens[j];
          const dx=o.x-t.x, dy=o.y-t.y;
          const dist=Math.hypot(dx,dy), minD=t.r+o.r;
          if (dist>0 && dist<minD){
            const k=(minD-dist)/2, nx=dx/dist, ny=dy/dist;
            t.x-=nx*k; t.y-=ny*k; o.x+=nx*k; o.y+=ny*k;
            const tvx=t.vx, tvy=t.vy; t.vx=o.vx*.5; t.vy=o.vy*.5; o.vx=tvx*.5; o.vy=tvy*.5;
          }
        }
        // draw token (顯示名字縮寫)
        // draw token (顯示名字縮寫 + 顏色)
        ctx.save();
        // 外圈淡色陰影
        ctx.beginPath(); ctx.arc(t.x,t.y,t.r,0,Math.PI*2);
        ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fill();

        // 彩色圓片
        ctx.beginPath(); ctx.arc(t.x,t.y,t.r*0.92,0,Math.PI*2);
        ctx.fillStyle = t.color || "#8ab4f8";
        ctx.fill();

        // 文字（自動選白或深色以確保對比）
        const useDarkText = (() => {
          const c = (t.color || "#8ab4f8").replace("#","");
          const r = parseInt(c.substr(0,2),16), g = parseInt(c.substr(2,2),16), b = parseInt(c.substr(4,2),16);
          const lum = 0.2126*r + 0.7152*g + 0.0722*b; // 粗略亮度
          return lum > 160; // 亮底用深字
        })();
        ctx.fillStyle = useDarkText ? "#111827" : "rgba(255,255,255,.95)";
        ctx.font = `${Math.floor(t.r*0.9)}px system-ui, "Microsoft JhengHei"`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(t.label, t.x, t.y+1);
        ctx.restore();
      }
      requestAnimationFrame(step);
    }

    // 取代原本的 spawnToken，並在繪圖處用 t.color
    function randColor(){
      // 柔和但彼此有區隔的調色盤（可自行加減）
      const palette = [
        "#5eead4","#60a5fa","#a78bfa","#f472b6","#f59e0b",
        "#34d399","#fb7185","#22d3ee","#93c5fd","#fbbf24"
      ];
      return palette[Math.floor(Math.random()*palette.length)];
    }

    function spawnToken(label, color){
      const r = tokenR;                          // ← 用放大的半徑
      const x = jar.x + 20 + Math.random()*(jar.w-40);
      const y = jar.y + 12 + r;
      const vx = (Math.random()*2-1)*2;
      tokens.push({ x, y, vx, vy:0, r, label: label || "票", color: color || "#8ab4f8" });
      if (tokens.length > 600) tokens.shift();
    }


    function clearTokens(){ tokens.length = 0; }

    // init
    resize(); requestAnimationFrame(step);
    window.addEventListener('resize', resize);

    return { spawnToken, clearTokens };
  }

  return { create };
})();
