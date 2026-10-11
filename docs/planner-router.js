/* Shareable locations; record data is resolved only after the workspace has loaded. */
window.createPlannerRouter = function (bridge) {
  if (!window.history?.pushState) return {changed() {}};
  const encode = state => '#'+new URLSearchParams(Object.entries(state).filter(([,value])=>value!==undefined&&value!==null&&value!=='')).toString();
  let index=0, current='', applying=false, queued=false;
  function replace(){current=encode(bridge.location());window.history.replaceState({plannerIndex:index},'',current)}
  function restore(){
    const target=window.location.hash;
    if(target===current)return;
    if(!window.DraftGuard.canLeave()){
      const next=window.history.state?.plannerIndex;
      if(Number.isInteger(next)&&next!==index)window.history.go(index-next);
      else window.history.replaceState({plannerIndex:index},'',current);
      return;
    }
    applying=true;
    try{bridge.restore(Object.fromEntries(new URLSearchParams(target.replace(/^#/,''))));index=window.history.state?.plannerIndex??index;replace()}
    finally{applying=false}
  }
  window.addEventListener('popstate',restore);
  window.addEventListener('hashchange',restore);
  // Boot restoration must happen after authentication, workspace hydration and shared guards.
  restore();
  if(!current)replace();
  return {changed(){
    if(applying||queued)return;queued=true;
    queueMicrotask(()=>{queued=false;if(applying)return;const next=encode(bridge.location());if(next===current)return;current=next;window.history.pushState({plannerIndex:++index},'',next)});
  }};
};
