export function gardenTitle(settings){
 const recipient=settings.recipient.trim();
 return recipient?`${recipient}的星愿花园`:'星愿花园';
}

// A greeting belongs to a home visit, never to a render or a saved check-in.
export const HOME_RETURN_DELAY=30_000;
export const HOME_ENCOURAGEMENTS=Object.freeze([
 {id:'small-step',text:'一小步也很好，今天我们慢慢来。'},
 {id:'own-pace',text:'不用赶路，照着自己的节奏往前走。'},
 {id:'begin',text:'先做一件小事，美好会慢慢靠近。'},
 {id:'ordinary',text:'平凡的一天，也能长出小小的光。'},
 {id:'rest',text:'累了就歇一歇，我陪你慢慢走。'},
 {id:'try',text:'不必一下做得很好，愿意试试就很棒。'},
 {id:'today',text:'今天有今天的可能，我们一起看看。'},
 {id:'care',text:'留一点时间，做让自己舒服的小事。'},
 {id:'gentle',text:'对自己温柔一点，成长自有它的时间。'},
 {id:'again',text:'什么时候开始，都有新的可能。'},
 {id:'notice',text:'那些小小的努力，都在悄悄发光。'},
 {id:'company',text:'路可以慢慢走，今天也有我陪着你。'},
].map(Object.freeze));
export function pickHomeEncouragement(previousId,random=Math.random){
 const choices=HOME_ENCOURAGEMENTS.filter(item=>item.id!==previousId);
 const value=random(),index=Number.isFinite(value)?Math.max(0,Math.min(choices.length-1,Math.floor(value*choices.length))):0;
 return choices[index];
}
export function createHomeCompanionSession({random=Math.random}={}){
 let previousView=null,wasConfigured=false,wasVisible=true,hiddenAt=null,pending=false,lastId=null,current=null,visit=0;
 return {
  get current(){return current;},
  // New document/entering Today picks once. Same-tab navigation Back also enters.
  // Foreground after >=30 s is a new visit; quick interruptions and dialog Back are not.
  // pageshow + visibilitychange may both fire: transitions are consumed only once.
  sync({view,configured,visible=true,modalOpen=false,now=Date.now()}){
   if(!visible&&wasVisible)hiddenAt=now;
   if(visible&&!wasVisible){if(hiddenAt!==null&&now-hiddenAt>=HOME_RETURN_DELAY)pending=true;hiddenAt=null;}
   if(view==='today'&&previousView!=='today'||configured&&!wasConfigured)pending=true;
   previousView=view;wasConfigured=configured;wasVisible=visible;
   if(!configured){const changed=current!==null;current=null;return changed;}
   if(view!=='today'||!visible||modalOpen||(!pending&&current))return false;
   const message=pickHomeEncouragement(lastId,random);lastId=message.id;
   current=Object.freeze({...message,visit:++visit});pending=false;return true;
  },
 };
}
