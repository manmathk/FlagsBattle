// Keep Guess the Flag running continuously for YouTube vertical live.
// The original game calls finish() after round 10; replace that terminal behavior with a new match.
(function(){
  if(typeof finish!=='function'||typeof next!=='function')return;
  var originalFinish=finish;
  finish=function(){
    st.active=false;
    if(st.round>=10){
      st.round=0;
      st.used=new Set();
      $('progress').style.width='0%';
      $('difficulty').textContent='EASY';
      $('mult').textContent='×1';
      $('clue').textContent='NEXT MATCH STARTING...';
      $('status').textContent='NEW MATCH';
      dots();
      if(st.sound)say('New match starting. Get ready!');
      setTimeout(function(){
        if(st.music&&$('bgm').paused)$('bgm').play().catch(function(){});
        st.active=true;
        next();
      },1200);
    }else{
      originalFinish();
    }
  };
})();
