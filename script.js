/* R&S Private Space — performant Supabase chat controller */
const CONFIG={APP_NAME:"R&S",SUPABASE_URL:"https://vliyvcnrkvthweqxjbns.supabase.co",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_Nx8m4dqTjmy28jwVy1livg_Y7XF7H5Q",STORAGE:{MEDIA_BUCKET:"chat-media",VOICE_BUCKET:"chat-voice"},IDENTITIES:{FIRST:{key:"first",name:"Thyme",pfp:"./shadow.jpg"},SECOND:{key:"second",name:"Inaya",pfp:"./rose.jpg"}},PRESENCE_STALE_MS:45000,URL_TTL:330};
const STATE={supabase:null,selectedIdentityKey:null,currentUser:null,counterpartUser:null,roomId:null,messages:[],messageById:new Map(),selectedMessageId:null,replyTargetMessage:null,replyJumpTimerId:null,editingMessageId:null,realtimeChannel:null,heartbeatIntervalId:null,activeAudioPlayer:null,activeAudioUI:null,mediaRecorder:null,audioChunks:[],recordingTimerId:null,recordingStartTime:0,recordingPausedAt:0,recordingPausedTotal:0,pendingUploadFile:null,pendingUploadFiles:[],pendingPreviewUrl:null,pendingPreviewUrls:[],pendingImageRotation:0,mediaUrlCache:new Map(),presenceBootstrapped:false,typingTimeoutId:null,typingStopTimeoutId:null,isTyping:false,counterpartTyping:false,counterpartRecording:false,renderQueued:false,isUploading:false,toastTimer:null,seenByCounterpart:new Set(),seenMessageIds:new Set(),pendingSeenMessageIds:new Set(),seenObserver:null,seenSchemaWarningShown:false,pendingDocumentFile:null,isUploadingDocument:false,isSendingMessage:false,pendingNewMessagesBelow:0};
const $=id=>document.getElementById(id);const esc=s=>String(s??"");

document.addEventListener("DOMContentLoaded",initApp);
async function initApp(){
  STATE.supabase=window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
  bindIdentityUI();setupEventListeners();showScreen("loginScreen");
}
function bindIdentityUI(){const a=CONFIG.IDENTITIES.FIRST,b=CONFIG.IDENTITIES.SECOND;$("nameFirstCard").textContent=a.name;$("pfpFirstCard").src=a.pfp;$("nameSecondCard").textContent=b.name;$("pfpSecondCard").src=b.pfp;}
function showScreen(id){document.querySelectorAll(".screen").forEach(s=>s.classList.add("hidden"));$(id).classList.remove("hidden");}
function showToast(message){const t=$("toast");t.textContent=message;t.classList.remove("hidden");clearTimeout(STATE.toastTimer);STATE.toastTimer=setTimeout(()=>t.classList.add("hidden"),2800);}
function setLoading(button,busy,label){if(!button)return;button.disabled=busy;button.dataset.oldText=button.dataset.oldText||button.textContent;if(busy)button.textContent=label||"Working…";else button.textContent=button.dataset.oldText;}

function setupEventListeners(){
  $("identityCardFirst").onclick=()=>selectIdentity("first");$("identityCardSecond").onclick=()=>selectIdentity("second");
  $("btnBackToIdentities").onclick=()=>{ $("passwordStep").classList.add("hidden");$("identityStep").classList.remove("hidden");STATE.selectedIdentityKey=null; };
  $("btnTogglePassword").onclick=()=>{const i=$("passwordInput");i.type=i.type==="password"?"text":"password";};
  $("passwordForm").onsubmit=e=>{e.preventDefault();handleLogin();};
  $("btnThreeDots").onclick=e=>{e.stopPropagation();$("threeDotsMenu").classList.toggle("hidden");};
  document.addEventListener("click",()=>{$("threeDotsMenu").classList.add("hidden");dismissFloatingReactionPicker();});
  $("threeDotsMenu").onclick=e=>e.stopPropagation();
  $("btnOpenMediaGallery").onclick=()=>{closeMenus();openMediaGallery();};$("btnOpenVoiceGallery").onclick=()=>{closeMenus();openVoiceGallery();};$("btnClearHistory").onclick=()=>{closeMenus();$("clearHistoryModal").classList.remove("hidden");};
  $("btnCloseMediaGallery").onclick=()=>closeModal("mediaGalleryOverlay");$("btnCloseVoiceGallery").onclick=()=>closeModal("voiceGalleryOverlay");$("btnCloseReactionDetails").onclick=()=>closeModal("reactionDetailsModal");$("btnCloseAllReactions").onclick=()=>closeModal("allReactionsModal");$("btnCancelClearHistory").onclick=()=>closeModal("clearHistoryModal");$("btnCancelDeleteDialog").onclick=()=>closeModal("deleteChoicesModal");
  $("btnConfirmClearHistory").onclick=executeClearChatHistory;
  $("btnMoreReactions").onclick=e=>{e.stopPropagation();if(!STATE.selectedMessageId)return;$("allReactionsModal").classList.remove("hidden");};
  $("allEmojiPicker").addEventListener("emoji-click",e=>{e.stopPropagation();const emoji=e.detail?.unicode;if(!emoji||!STATE.selectedMessageId)return;const id=STATE.selectedMessageId;toggleMessageReaction(id,emoji).finally(()=>{closeModal("allReactionsModal");clearMessageSelection();});});
  const ta=$("messageTextArea");ta.addEventListener("input",()=>{onComposerInput();broadcastTypingState(true);});ta.addEventListener("blur",()=>broadcastTypingState(false));// Enter inserts a newline in the textarea. Messages are sent only with the Send button.
  $("btnJumpToLatest").onclick=()=>scrollToBottom(true);$("chatMessages").addEventListener("scroll",handleChatScroll,{passive:true});
  $("btnSendMessage").onclick=handleSendMessage;$("btnAttachMedia").onclick=()=>$("mediaFileInput").click();$("mediaFileInput").onchange=handleFileSelected;$("btnAttachFile").onclick=()=>$("documentFileInput").click();$("documentFileInput").onchange=handleDocumentFileSelected;
  $("btnCancelMediaPreview").onclick=cancelMediaPreview;$("btnRotateImage").onclick=rotatePreviewImage;$("btnConfirmSendMedia").onclick=uploadAndSendMedia;
  $("btnCancelFilePreview").onclick=cancelFilePreview;$("btnConfirmSendFile").onclick=uploadAndSendDocument;
  $("btnMicRecord").onclick=startVoiceRecording;$("btnDiscardRecord").onclick=stopAndDiscardRecording;$("btnPauseResumeRecord").onclick=togglePauseRecording;$("btnSendRecord").onclick=stopAndSendRecording;
  $("btnCancelSelection").onclick=clearMessageSelection;$("btnCopySelected").onclick=copySelectedMessage;$("btnReplySelected").onclick=()=>initiateReply();$("btnEditSelected").onclick=initiateEdit;$("btnDeleteSelected").onclick=openDeleteChoicesModal;
  $("btnDeleteForMe").onclick=executeDeleteForMe;$("btnDeleteForEveryone").onclick=executeDeleteForEveryone;
  $("btnCancelReply").onclick=cancelReplyState;$("btnCancelEdit").onclick=cancelEditState;
  const replyBanner=$("replyPreviewBanner");
  replyBanner.addEventListener("click",e=>{if(e.target.closest("button"))return;if(STATE.replyTargetMessage)jumpToOriginalMessage(STATE.replyTargetMessage.id);});
  const replyBannerContent=replyBanner.querySelector(".context-content");
  if(replyBannerContent){replyBannerContent.setAttribute("role","button");replyBannerContent.setAttribute("tabindex","0");replyBannerContent.setAttribute("aria-label","Jump to replied message");replyBannerContent.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button")){e.preventDefault();if(STATE.replyTargetMessage)jumpToOriginalMessage(STATE.replyTargetMessage.id);}});}
  $("btnCloseFullscreen").onclick=closeFullscreen;$("btnDownloadFullscreen").onclick=e=>{if(!e.currentTarget.href)return;};
  document.querySelectorAll(".reaction-emoji-btn").forEach(b=>b.onclick=e=>{e.stopPropagation();if(STATE.selectedMessageId)toggleMessageReaction(STATE.selectedMessageId,b.dataset.emoji).finally(()=>{dismissFloatingReactionPicker();clearMessageSelection();});});
  window.addEventListener("pagehide",()=>{broadcastTypingState(false);broadcastRecordingState(false);sendHeartbeat(false);});window.addEventListener("beforeunload",()=>{broadcastTypingState(false);broadcastRecordingState(false);sendHeartbeat(false);});document.addEventListener("visibilitychange",()=>{if(STATE.currentUser){sendHeartbeat(!document.hidden);if(!document.hidden)observeVisibleIncomingMessages();}});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){["mediaPreviewOverlay","fileUploadPreviewOverlay","fullscreenViewerOverlay","mediaGalleryOverlay","voiceGalleryOverlay","reactionDetailsModal","allReactionsModal","deleteChoicesModal","clearHistoryModal"].forEach(closeModal);clearMessageSelection();}});
}
function closeMenus(){$("threeDotsMenu").classList.add("hidden");}function closeModal(id){$(id).classList.add("hidden");}
function onComposerInput(){const ta=$("messageTextArea");ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,126)+"px";const has=ta.value.trim().length>0||!!STATE.editingMessageId;$("btnSendMessage").classList.toggle("hidden",!has);$("btnMicRecord").classList.toggle("hidden",has);}
function selectIdentity(key){STATE.selectedIdentityKey=key;const c=key==="first"?CONFIG.IDENTITIES.FIRST:CONFIG.IDENTITIES.SECOND;$("passwordAvatar").src=c.pfp;$("passwordIdentityName").textContent=c.name;$("passwordInput").value="";$("passwordError").classList.add("hidden");$("identityStep").classList.add("hidden");$("passwordStep").classList.remove("hidden");setTimeout(()=>$("passwordInput").focus(),60);}

async function handleLogin(){const password=$("passwordInput").value.trim();if(!password||!STATE.selectedIdentityKey)return;const submit=$("btnLoginSubmit");setLoading(submit,true,"Entering…");$("passwordError").classList.add("hidden");try{
  let session=(await STATE.supabase.auth.getSession()).data.session;if(!session){const auth=await STATE.supabase.auth.signInAnonymously();if(auth.error)throw auth.error;}
  const {data:isValid,error}=await STATE.supabase.rpc("verify_identity_password",{p_identity_key:STATE.selectedIdentityKey,p_password:password});if(error)throw error;if(!isValid){$("passwordError").classList.remove("hidden");return;}
  STATE.currentUser=STATE.selectedIdentityKey==="first"?CONFIG.IDENTITIES.FIRST:CONFIG.IDENTITIES.SECOND;STATE.counterpartUser=STATE.selectedIdentityKey==="first"?CONFIG.IDENTITIES.SECOND:CONFIG.IDENTITIES.FIRST;
  STATE.seenByCounterpart=new Set();STATE.seenMessageIds=new Set();STATE.pendingSeenMessageIds=new Set();STATE.seenSchemaWarningShown=false;setupSeenObserver();
  // Clear History is strictly a Shadow-only control.
  $("btnClearHistory").classList.toggle("hidden",STATE.currentUser.key!=="first");
  const {data:room,error:roomErr}=await STATE.supabase.from("rooms").select("id").eq("name","permanent_rs_room").single();if(roomErr)throw roomErr;STATE.roomId=room.id;
  $("counterpartPfp").src=STATE.counterpartUser.pfp;$("counterpartName").textContent=STATE.counterpartUser.name;updatePresenceStatusUI(false,null,true);showScreen("chatScreen");
  await Promise.all([loadMessages(),loadCounterpartPresence()]);subscribeRealtime();startPresenceHeartbeat();
 }catch(err){console.error(err);$("passwordError").textContent=err.message||"Unable to enter space.";$("passwordError").classList.remove("hidden");}finally{setLoading(submit,false);}}

async function loadMessages(){const loading=$("messagesLoading");loading.classList.remove("hidden");try{const {data,error}=await STATE.supabase.from("messages").select("*,message_reactions(*),message_visibility(*)").eq("room_id",STATE.roomId).order("created_at",{ascending:true});if(error)throw error;STATE.messages=(data||[]).filter(m=>!m.message_visibility?.some(v=>v.identity_key===STATE.currentUser.key&&v.is_hidden));rebuildMessageMap();await loadSeenReceipts();renderMessagesList(true);}catch(e){console.error(e);showToast("Failed to load messages.");}finally{loading.classList.add("hidden");}}
async function loadSeenReceipts(){try{const {data,error}=await STATE.supabase.from("message_seen_receipts").select("message_id,seen_by_identity_key,seen_at").eq("seen_by_identity_key",STATE.counterpartUser.key);if(error)throw error;STATE.seenByCounterpart=new Set((data||[]).map(r=>r.message_id));}catch(e){console.warn("Seen receipts unavailable; apply the follow-up Supabase migration.",e);if(!STATE.seenSchemaWarningShown){STATE.seenSchemaWarningShown=true;showToast("Seen receipts need the follow-up Supabase SQL migration.");}}}
function rebuildMessageMap(){STATE.messageById.clear();for(const m of STATE.messages)STATE.messageById.set(m.id,m);}
function renderMessagesList(forceBottom=false){if(STATE.renderQueued)return;STATE.renderQueued=true;requestAnimationFrame(()=>{STATE.renderQueued=false;const viewport=$("chatMessages"),c=$("messagesList");const shouldStick=forceBottom||isNearBottom();c.innerHTML="";if(!STATE.messages.length){$("emptyChatState").classList.remove("hidden");updateJumpToLatestButton();return;}$("emptyChatState").classList.add("hidden");let last="";const frag=document.createDocumentFragment();for(const m of STATE.messages){const d=new Date(m.created_at).toDateString();if(d!==last){const s=document.createElement("div");s.className="date-separator";s.textContent=formatDateGroup(new Date(m.created_at));frag.appendChild(s);last=d;}frag.appendChild(createMessageBubbleElement(m));}c.appendChild(frag);observeVisibleIncomingMessages();if(shouldStick){scrollToBottom(false);}else{updateJumpToLatestButton();}});}
function isNearBottom(){const c=$("chatMessages");return c.scrollHeight-c.scrollTop-c.clientHeight<100;}
function handleChatScroll(){if(isNearBottom()){STATE.pendingNewMessagesBelow=0;}updateJumpToLatestButton();}
function updateJumpToLatestButton(){const button=$("btnJumpToLatest");if(!button)return;const count=STATE.pendingNewMessagesBelow||0;button.classList.toggle("hidden",count===0);button.textContent=count>0?`↓ ${count} new message${count===1?"":"s"}`:"↓ Latest messages";button.setAttribute("aria-label",count>0?`Jump to latest messages, ${count} new message${count===1?"":"s"} below`:"Jump to latest messages");}
function formatDateGroup(d){const today=new Date(),y=new Date(today);y.setDate(today.getDate()-1);if(d.toDateString()===today.toDateString())return"Today";if(d.toDateString()===y.toDateString())return"Yesterday";return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}

function createMessageBubbleElement(msg){const own=msg.sender_key===STATE.currentUser.key,row=document.createElement("div");row.className=`message-row ${own?"own":"counterpart"}`;row.dataset.id=msg.id;row.style.marginBottom="7px";const bubble=document.createElement("div");bubble.className="message-bubble";
  const name=document.createElement("span");name.className="message-sender-name";name.textContent=own?STATE.currentUser.name:STATE.counterpartUser.name;bubble.appendChild(name);
  if(msg.reply_to_id&&STATE.messageById.has(msg.reply_to_id)){const parent=STATE.messageById.get(msg.reply_to_id),q=document.createElement("div");q.className="reply-reference-quote";q.title="Tap to view original message";q.setAttribute("role","button");q.setAttribute("tabindex","0");q.setAttribute("aria-label","Jump to replied message");const a=document.createElement("span");a.className="reply-reference-author";a.textContent=parent.sender_key===STATE.currentUser.key?STATE.currentUser.name:STATE.counterpartUser.name;const t=document.createElement("div");t.className="reply-reference-preview";setExpandablePreview(t,getMessageReplyPreview(parent),30);q.append(a,t);q.onclick=e=>{if(e.target.closest("button"))return;e.stopPropagation();jumpToOriginalMessage(msg.reply_to_id);};q.onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&!e.target.closest("button")){e.preventDefault();jumpToOriginalMessage(msg.reply_to_id);}};bubble.appendChild(q);}
  if(msg.is_deleted_everyone){const p=document.createElement("p");p.className="deleted-message";p.textContent="This message was deleted";bubble.appendChild(p);}else if(msg.message_type==="text"||msg.message_type==="link"){const p=document.createElement("p");p.textContent=msg.content||"";bubble.appendChild(p);}else if(msg.message_type==="image"||msg.message_type==="video"){bubble.appendChild(createMediaBlock(msg));}else if(msg.message_type==="voice"){bubble.appendChild(createInlineVoicePlayer(msg));}else if(msg.message_type==="file"){bubble.appendChild(createFileBlock(msg));}
  const footer=document.createElement("div");footer.className="message-timestamp";if(msg.is_edited){const e=document.createElement("span");e.className="edited-tag";e.textContent="edited";footer.appendChild(e);}footer.appendChild(document.createTextNode(formatTime(new Date(msg.created_at))));bubble.appendChild(footer);
  if(msg.message_reactions?.length){const r=document.createElement("button");r.type="button";r.className="message-reactions-badge";r.textContent=`${[...new Set(msg.message_reactions.map(x=>x.emoji))].join(" ")} ${msg.message_reactions.length}`;r.onclick=e=>{e.stopPropagation();openReactionDetailsModal(msg.message_reactions);};bubble.appendChild(r);}row.appendChild(bubble);
  if(own){const receipt=document.createElement("span");const seen=STATE.seenByCounterpart.has(msg.id);receipt.className=`message-seen-indicator ${seen?"is-seen":"is-unseen"}`;receipt.textContent="✓";receipt.title=seen?`Seen by ${STATE.counterpartUser.name}`:`Not seen by ${STATE.counterpartUser.name} yet`;receipt.setAttribute("aria-label",receipt.title);row.appendChild(receipt);}
  attachBubbleGestureListeners(row,msg);return row;}

function getMessageReplyPreview(msg){if(!msg)return"Message unavailable";if(msg.is_deleted_everyone)return"Message deleted";const group=getMediaGroup(msg);if(group)return `Photo/video · ${group.items.length} items`;if(msg.message_type==="text"||msg.message_type==="link")return msg.content||"Message";if(msg.message_type==="image")return msg.content||"Photo";if(msg.message_type==="video")return msg.content||"Video";if(msg.message_type==="voice")return"Voice message";if(msg.message_type==="file")return msg.file_name?`File: ${msg.file_name}`:"File attachment";return msg.content||"Message";}
function setExpandablePreview(container,rawValue,maxChars=30){const rawText=String(rawValue||"");container.innerHTML="";container.classList.add("expandable-preview");const copy=document.createElement("span");copy.className="reply-preview-copy";const toggle=document.createElement("button");toggle.type="button";toggle.className="reply-see-more";let expanded=false;const render=()=>{const long=rawText.length>maxChars;copy.textContent=long&&!expanded?rawText.slice(0,maxChars).trimEnd()+"…":rawText;toggle.textContent=expanded?"See less":"See more";toggle.classList.toggle("hidden",!long);};toggle.onclick=e=>{e.preventDefault();e.stopPropagation();expanded=!expanded;render();};container.append(copy,toggle);render();}
function formatTime(d){return d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});}

function createMediaBlock(msg){const group=getMediaGroup(msg);if(group){const grid=document.createElement("div");grid.className="chat-media-group-grid";group.items.forEach((item,index)=>{const tile=document.createElement("div");tile.className="chat-media-group-tile";const type=item.message_type||((item.mime_type||"").startsWith("video/")?"video":"image");const media=type==="video"?document.createElement("video"):document.createElement("img");media.className="chat-media-element chat-media-group-element";media.loading="lazy";if(media.tagName==="VIDEO"){media.controls=true;media.playsInline=true;media.preload="metadata";}else media.alt=item.file_name||"Shared photo";loadAuthorizedMediaUrl(item.storage_path,CONFIG.STORAGE.MEDIA_BUCKET).then(url=>{if(url)media.src=url;});media.onclick=()=>media.src&&openFullscreenMedia(media.src,type,item.file_name);tile.appendChild(media);const dl=document.createElement("button");dl.type="button";dl.className="media-action-btn chat-media-group-download";dl.textContent="↓";dl.title=`Download ${item.file_name||"media"}`;dl.onclick=e=>{e.stopPropagation();downloadStorageFile(item.storage_path,CONFIG.STORAGE.MEDIA_BUCKET,item.file_name||`media-${index+1}`);};tile.appendChild(dl);grid.appendChild(tile);});return grid;}const wrap=document.createElement("div");wrap.className=`media-wrap ${msg.message_type==="video"?"video-wrap":""}`;const media=msg.message_type==="image"?document.createElement("img"):document.createElement("video");media.className="chat-media-element";media.loading="lazy";if(media.tagName==="VIDEO"){media.controls=true;media.playsInline=true;media.preload="metadata";}else media.alt="Shared image";loadAuthorizedMediaUrl(msg.storage_path,CONFIG.STORAGE.MEDIA_BUCKET).then(url=>{if(url)media.src=url;});media.onclick=()=>{if(media.src)openFullscreenMedia(media.src,msg.message_type,msg.file_name);};wrap.appendChild(media);const actions=document.createElement("div");actions.className="media-action-row";const dl=document.createElement("button");dl.type="button";dl.className="media-action-btn";dl.textContent="↓ Download";dl.onclick=e=>{e.stopPropagation();downloadStorageFile(msg.storage_path,CONFIG.STORAGE.MEDIA_BUCKET,msg.file_name||`media-${msg.id}`);};actions.appendChild(dl);wrap.appendChild(actions);if(msg.content){const cap=document.createElement("p");cap.textContent=msg.content;cap.style.marginTop="6px";wrap.appendChild(cap);}return wrap;}

function createFileBlock(msg){const card=document.createElement("div");card.className="shared-file-card";const ext=getFileExtension(msg.file_name);const icon=document.createElement("span");icon.className=`file-type-icon shared-file-icon ${getFileIconClass(ext)}`;icon.textContent=(ext||"FILE").slice(0,5).toUpperCase();const info=document.createElement("div");info.className="shared-file-info";const name=document.createElement("strong");name.className="shared-file-name";name.textContent=msg.file_name||"Shared file";name.title=name.textContent;const details=document.createElement("span");details.className="shared-file-details";details.textContent=[formatBytes(msg.file_size),getFileTypeLabel(msg.mime_type,ext)].filter(Boolean).join(" • ")||"File attachment";info.append(name,details);card.append(icon,info);const dl=document.createElement("button");dl.type="button";dl.className="shared-file-download";dl.textContent="↓ Download";dl.setAttribute("aria-label",`Download ${msg.file_name||"file"}`);dl.onclick=e=>{e.stopPropagation();downloadStorageFile(msg.storage_path,CONFIG.STORAGE.MEDIA_BUCKET,msg.file_name||`file-${msg.id}`);};card.appendChild(dl);return card;}
function getFileExtension(name){const m=String(name||"").match(/\.([a-z0-9]{1,10})$/i);return m?m[1].toLowerCase():"file";}
function getFileIconClass(ext){if(["pdf"].includes(ext))return"file-icon-pdf";if(["doc","docx","odt","rtf"].includes(ext))return"file-icon-doc";if(["xls","xlsx","csv"].includes(ext))return"file-icon-sheet";if(["ppt","pptx"].includes(ext))return"file-icon-slide";if(["apk","exe","msi","dmg","deb","rpm"].includes(ext))return"file-icon-app";if(["zip","rar","7z","tar","gz"].includes(ext))return"file-icon-archive";if(["txt","md","json","xml","html","css","js","py","sql"].includes(ext))return"file-icon-text";return"file-icon-generic";}
function getFileTypeLabel(mime,ext){if(mime&&mime!=="application/octet-stream")return mime;return ext&&ext!=="file"?`${ext.toUpperCase()} file`:"File";}
function formatBytes(bytes){const n=Number(bytes);if(!Number.isFinite(n)||n<0)return"";if(n<1024)return`${n} B`;if(n<1024*1024)return`${(n/1024).toFixed(1)} KB`;if(n<1024*1024*1024)return`${(n/(1024*1024)).toFixed(1)} MB`;return`${(n/(1024*1024*1024)).toFixed(2)} GB`;}

function attachBubbleGestureListeners(row,msg){let sx=0,sy=0,cx=0,cy=0,horizontal=false,moved=false,timer=null;const REPLY_TRIGGER=56;const reset=()=>{clearTimeout(timer);timer=null;row.style.transform="";horizontal=false;moved=false;};row.addEventListener("touchstart",e=>{const t=e.touches[0];if(!t)return;sx=cx=t.clientX;sy=cy=t.clientY;horizontal=false;moved=false;clearTimeout(timer);timer=setTimeout(()=>{if(!moved)triggerMessageSelection(msg,row);},460);},{passive:true});row.addEventListener("touchmove",e=>{const t=e.touches[0];if(!t)return;cx=t.clientX;cy=t.clientY;const dx=cx-sx,dy=cy-sy;if(Math.abs(dx)>8||Math.abs(dy)>8)clearTimeout(timer);if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.15){horizontal=true;moved=true;clearTimeout(timer);const translate=Math.max(-12,Math.min(78,dx));row.style.transform=`translateX(${translate}px)`;}else if(Math.abs(dy)>12){moved=true;clearTimeout(timer);}},{passive:true});row.addEventListener("touchend",()=>{clearTimeout(timer);const dx=cx-sx;row.style.transform="";const shouldReply=horizontal&&dx>=REPLY_TRIGGER;horizontal=false;moved=false;if(shouldReply)initiateReply(msg);});row.addEventListener("touchcancel",reset);row.addEventListener("contextmenu",e=>{e.preventDefault();triggerMessageSelection(msg,row);});}
function triggerMessageSelection(msg,row){STATE.selectedMessageId=msg.id;document.querySelectorAll(".message-row").forEach(x=>x.classList.remove("selected-bubble"));row.classList.add("selected-bubble");const own=msg.sender_key===STATE.currentUser.key,ok=Date.now()-new Date(msg.created_at).getTime()<=300000;$("btnEditSelected").classList.toggle("hidden",!(own&&msg.message_type==="text"&&ok));$("selectionToolbar").classList.remove("hidden");$("normalHeader").classList.add("hidden");positionFloatingReactionPicker(row);}
function positionFloatingReactionPicker(row){const p=$("floatingReactionPicker"),r=row.getBoundingClientRect(),a=$("app").getBoundingClientRect();let top=r.top-a.top-52;if(top<8)top=r.bottom-a.top+8;p.style.top=`${top}px`;p.style.transform="translateX(-50%)";p.classList.remove("hidden");}
function dismissFloatingReactionPicker(){$("floatingReactionPicker").classList.add("hidden");}function clearMessageSelection(){STATE.selectedMessageId=null;document.querySelectorAll(".message-row").forEach(r=>r.classList.remove("selected-bubble"));$("selectionToolbar").classList.add("hidden");$("normalHeader").classList.remove("hidden");dismissFloatingReactionPicker();}
function jumpToOriginalMessage(messageId){const target=document.querySelector(`.message-row[data-id="${CSS.escape(String(messageId))}"]`);if(!target)return showToast("Original message is not available in this chat.");const scroller=$("chatMessages");if(scroller){const targetRect=target.getBoundingClientRect(),scrollerRect=scroller.getBoundingClientRect();const centeredDelta=targetRect.top-scrollerRect.top-(scroller.clientHeight-targetRect.height)/2;scroller.scrollTo({top:scroller.scrollTop+centeredDelta,behavior:"smooth"});}else target.scrollIntoView({behavior:"smooth",block:"center"});document.querySelectorAll(".reply-jump-highlight").forEach(el=>el.classList.remove("reply-jump-highlight"));void target.offsetWidth;target.classList.add("reply-jump-highlight");clearTimeout(STATE.replyJumpTimerId);STATE.replyJumpTimerId=setTimeout(()=>{target.classList.remove("reply-jump-highlight");STATE.replyJumpTimerId=null;},2000);}

function createInlineVoicePlayer(msg){const wrap=document.createElement("div");wrap.className="voice-player";const row=document.createElement("div");row.className="voice-controls-row";const play=document.createElement("button");play.type="button";play.className="btn-voice-play";play.textContent="▶";const wave=document.createElement("div");wave.className="voice-waveform";const count=31;const seed=hashString(msg.id);for(let i=0;i<count;i++){const b=document.createElement("span");b.className="wave-bar";const h=7+((seed+i*17)%24);b.style.height=`${h}px`;wave.appendChild(b);}const speed=document.createElement("button");speed.type="button";speed.className="voice-speed";speed.textContent="1×";row.append(play,wave,speed);const meta=document.createElement("div");meta.className="voice-meta-row";const time=document.createElement("span");time.textContent=`0:00 / ${formatDuration(msg.voice_duration||0)}`;const dl=document.createElement("button");dl.type="button";dl.className="voice-download-btn";dl.textContent="↓ MP3";dl.onclick=e=>{e.stopPropagation();downloadVoiceAsMp3(msg);};meta.append(time,dl);wrap.append(row,meta);
  let audio=null,rateIndex=0;const rates=[1,1.5,2,3];const reset=()=>{play.textContent="▶";if(wave)wave.querySelectorAll(".wave-bar").forEach(x=>x.classList.remove("played"));};
  const ensure=async()=>{if(audio)return audio;const url=await loadAuthorizedMediaUrl(msg.storage_path,CONFIG.STORAGE.VOICE_BUCKET);if(!url)throw new Error("Voice unavailable");audio=new Audio(url);audio.preload="metadata";audio.addEventListener("loadedmetadata",()=>time.textContent=`0:00 / ${formatDuration(audio.duration||msg.voice_duration||0)}`);audio.addEventListener("timeupdate",()=>{const dur=audio.duration||msg.voice_duration||0;time.textContent=`${formatDuration(audio.currentTime)} / ${formatDuration(dur)}`;const n=wave.children.length;const p=dur?Math.floor(audio.currentTime/dur*n):0;for(let i=0;i<n;i++)wave.children[i].classList.toggle("played",i<p);});audio.addEventListener("ended",reset);return audio;};
  play.onclick=async e=>{e.stopPropagation();try{if(STATE.activeAudioPlayer&&STATE.activeAudioPlayer!==audio){STATE.activeAudioPlayer.pause();if(STATE.activeAudioUI)STATE.activeAudioUI();}const a=await ensure();if(a.paused){await a.play();STATE.activeAudioPlayer=a;STATE.activeAudioUI=reset;play.textContent="Ⅱ";}else{a.pause();play.textContent="▶";}}catch(err){console.error(err);showToast("Unable to play voice clip.");}};
  speed.onclick=e=>{e.stopPropagation();rateIndex=(rateIndex+1)%rates.length;speed.textContent=`${rates[rateIndex]}×`;if(audio)audio.playbackRate=rates[rateIndex];};wave.onclick=async e=>{e.stopPropagation();try{const a=await ensure();const rect=wave.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));a.currentTime=(a.duration||msg.voice_duration||0)*ratio;}catch{}};return wrap;}
function hashString(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return Math.abs(h);}
function formatDuration(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;}

function updateActivityIndicators(){
  const typing=$("counterpartTypingIndicator"),recording=$("counterpartRecordingIndicator");
  if(typing)typing.classList.toggle("hidden",!STATE.counterpartTyping);
  if(recording)recording.classList.toggle("hidden",!STATE.counterpartRecording);
  const status=$("counterpartStatus");
  if(status&&!STATE.counterpartRecording&&!STATE.counterpartTyping)loadCounterpartPresence();
}
function broadcastActivity(event,payload={}){
  try{STATE.realtimeChannel?.send({type:"broadcast",event,payload:{...payload,identity_key:STATE.currentUser?.key||null}});}catch(e){console.warn("activity broadcast",e);}
}
function broadcastTypingState(active){
  if(!STATE.currentUser||!STATE.realtimeChannel)return;
  if(active){
    if(!STATE.isTyping){STATE.isTyping=true;broadcastActivity("typing",{active:true});}
    clearTimeout(STATE.typingStopTimeoutId);
    STATE.typingStopTimeoutId=setTimeout(()=>broadcastTypingState(false),1800);
  }else{
    clearTimeout(STATE.typingStopTimeoutId);
    STATE.typingStopTimeoutId=null;
    if(STATE.isTyping){STATE.isTyping=false;broadcastActivity("typing",{active:false});}
  }
}
function broadcastRecordingState(active){
  if(!STATE.currentUser||!STATE.realtimeChannel)return;
  broadcastActivity("recording",{active:!!active});
}
function handleRealtimeActivity(payload){
  const p=payload?.payload||{};
  if(!p.identity_key||p.identity_key===STATE.currentUser?.key||p.identity_key!==STATE.counterpartUser?.key)return;
  if(payload.event==="typing"){STATE.counterpartTyping=!!p.active;if(STATE.counterpartTyping)STATE.counterpartRecording=false;}
  if(payload.event==="recording"){STATE.counterpartRecording=!!p.active;if(STATE.counterpartRecording)STATE.counterpartTyping=false;}
  updateActivityIndicators();
}

async function startVoiceRecording(){if(STATE.mediaRecorder)return;try{if(!navigator.mediaDevices?.getUserMedia)throw new Error();const stream=await navigator.mediaDevices.getUserMedia({audio:true});const preferred=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t=>MediaRecorder.isTypeSupported?.(t))||"audio/webm";STATE.audioChunks=[];STATE.mediaRecorder=new MediaRecorder(stream,{mimeType:preferred});STATE.recordingStartTime=Date.now();STATE.recordingPausedAt=0;STATE.recordingPausedTotal=0;STATE.mediaRecorder.ondataavailable=e=>{if(e.data.size)STATE.audioChunks.push(e.data);};STATE.mediaRecorder.onstop=()=>stream.getTracks().forEach(t=>t.stop());STATE.mediaRecorder.start(250);broadcastRecordingState(true);$("normalComposer").classList.add("hidden");$("recordingComposer").classList.remove("hidden");updateRecordingTimer();STATE.recordingTimerId=setInterval(updateRecordingTimer,500);}catch(e){console.error(e);showToast("Microphone access denied or unavailable.");}}
function updateRecordingTimer(){if(!STATE.mediaRecorder)return;let now=Date.now(),paused=STATE.recordingPausedAt?now-STATE.recordingPausedAt:0;const sec=Math.max(0,Math.floor((now-STATE.recordingStartTime-STATE.recordingPausedTotal-paused)/1000));$("recordingTimer").textContent=formatDuration(sec);}
function togglePauseRecording(){const r=STATE.mediaRecorder;if(!r)return;if(r.state==="recording"){r.pause();STATE.recordingPausedAt=Date.now();$("btnPauseResumeRecord").textContent="▶";}else if(r.state==="paused"){STATE.recordingPausedTotal+=Date.now()-STATE.recordingPausedAt;STATE.recordingPausedAt=0;r.resume();$("btnPauseResumeRecord").textContent="Ⅱ";}updateRecordingTimer();}
function cleanupRecorder(){broadcastRecordingState(false);clearInterval(STATE.recordingTimerId);STATE.recordingTimerId=null;STATE.mediaRecorder?.stream?.getTracks().forEach(t=>t.stop());STATE.mediaRecorder=null;STATE.audioChunks=[];$("recordingComposer").classList.add("hidden");$("normalComposer").classList.remove("hidden");$("btnPauseResumeRecord").textContent="Ⅱ";$("recordingTimer").textContent="0:00";}
function stopAndDiscardRecording(){const r=STATE.mediaRecorder;if(!r)return;if(r.state!=="inactive")r.stop();cleanupRecorder();}
async function stopAndSendRecording(){
  const r=STATE.mediaRecorder;
  if(!r||r.state==="inactive")return;
  const replyToId=STATE.replyTargetMessage?.id||null;
  const startMime=r.mimeType||"audio/webm";
  const duration=Math.max(0,Math.floor((Date.now()-STATE.recordingStartTime-STATE.recordingPausedTotal-(STATE.recordingPausedAt?Date.now()-STATE.recordingPausedAt:0))/1000));
  const chunks=STATE.audioChunks,stream=r.stream;
  const afterStop=new Promise(resolve=>r.addEventListener("stop",resolve,{once:true}));
  r.stop();broadcastRecordingState(false);clearInterval(STATE.recordingTimerId);STATE.recordingTimerId=null;
  await afterStop;stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(chunks,{type:startMime});STATE.mediaRecorder=null;STATE.audioChunks=[];
  $("recordingComposer").classList.add("hidden");$("normalComposer").classList.remove("hidden");showToast("Uploading voice…");
  try{
    const ext=startMime.includes("mp4")?"m4a":"webm",name=`voice_${Date.now()}.${ext}`,path=`${STATE.roomId}/${name}`;
    const {error:upErr}=await STATE.supabase.storage.from(CONFIG.STORAGE.VOICE_BUCKET).upload(path,blob,{contentType:startMime,upsert:false});
    if(upErr)throw upErr;
    await insertChatMessage({message_type:"voice",storage_path:path,mime_type:startMime,file_name:name,voice_duration:duration},replyToId);
    cancelReplyState();showToast("Voice sent");
  }catch(e){console.error("voice send",e);showToast(getSendErrorMessage(e,"Voice send"));}
}

function handleFileSelected(e){
  const files=Array.from(e.target.files||[]);if(!files.length)return;
  const invalid=files.find(f=>!f.type.startsWith("image/")&&!f.type.startsWith("video/"));
  if(invalid){showToast("Choose photos/videos here; use the file button for documents.");e.target.value="";return;}
  const oversized=files.find(f=>f.size>80*1024*1024);
  if(oversized){showToast(`${oversized.name} is larger than 80 MB.`);e.target.value="";return;}
  cleanupPreviewUrl();STATE.pendingUploadFiles=files;STATE.pendingUploadFile=files[0]||null;STATE.pendingImageRotation=0;
  STATE.pendingPreviewUrls=files.map(f=>URL.createObjectURL(f));STATE.pendingPreviewUrl=STATE.pendingPreviewUrls[0]||null;
  const stage=$("previewMediaWrapper"),img=$("imagePreviewElement"),vid=$("videoPreviewElement"),editor=$("imageEditorBar");
  let grid=document.getElementById("multiMediaPreviewGrid");if(!grid){grid=document.createElement("div");grid.id="multiMediaPreviewGrid";grid.className="multi-media-preview-grid";stage.appendChild(grid);}
  grid.innerHTML="";const multi=files.length>1;grid.classList.toggle("hidden",!multi);img.classList.toggle("hidden",multi);vid.classList.toggle("hidden",multi);editor.classList.toggle("hidden",multi||files[0].type.startsWith("video/"));
  if(multi){files.forEach((file,i)=>{const tile=document.createElement("div");tile.className="multi-media-preview-tile";const el=file.type.startsWith("video/")?document.createElement("video"):document.createElement("img");el.src=STATE.pendingPreviewUrls[i];el.className="multi-media-preview-item";if(el.tagName==="VIDEO"){el.muted=true;el.playsInline=true;el.preload="metadata";}else el.alt=file.name;tile.appendChild(el);const label=document.createElement("span");label.textContent=file.type.startsWith("video/")?"VIDEO":"PHOTO";tile.appendChild(label);grid.appendChild(tile);});}
  else if(files[0].type.startsWith("video/")){vid.src=STATE.pendingPreviewUrl;img.removeAttribute("src");}
  else{img.src=STATE.pendingPreviewUrl;img.style.transform="rotate(0deg)";vid.pause();vid.removeAttribute("src");}
  const title=$("mediaPreviewOverlay").querySelector(".modal-title");if(title)title.textContent=multi?`Send ${files.length} items`:"Send Media";
  const send=$("btnConfirmSendMedia");if(send)send.innerHTML=`<span>Send ${files.length>1?files.length+" items":"Media"}</span><span>➤</span>`;
  $("mediaPreviewOverlay").classList.remove("hidden");
}
function rotatePreviewImage(){if(STATE.pendingUploadFiles.length>1)return;STATE.pendingImageRotation=(STATE.pendingImageRotation+90)%360;$("imagePreviewElement").style.transform=`rotate(${STATE.pendingImageRotation}deg)`;}
function cleanupPreviewUrl(){for(const url of STATE.pendingPreviewUrls||[])if(url)URL.revokeObjectURL(url);if(STATE.pendingPreviewUrl&&!STATE.pendingPreviewUrls?.length)URL.revokeObjectURL(STATE.pendingPreviewUrl);STATE.pendingPreviewUrls=[];STATE.pendingPreviewUrl=null;}
function cancelMediaPreview(){cleanupPreviewUrl();STATE.pendingUploadFile=null;STATE.pendingUploadFiles=[];$("mediaFileInput").value="";$("videoPreviewElement").pause();$("videoPreviewElement").removeAttribute("src");$("imagePreviewElement").removeAttribute("src");const grid=$("multiMediaPreviewGrid");if(grid){grid.innerHTML="";grid.classList.add("hidden");}const title=$("mediaPreviewOverlay").querySelector(".modal-title");if(title)title.textContent="Send Media";const send=$("btnConfirmSendMedia");if(send)send.innerHTML="<span>Send Media</span><span>➤</span>";closeModal("mediaPreviewOverlay");}
function handleDocumentFileSelected(e){const file=e.target.files?.[0];if(!file)return;if(file.type.startsWith("image/")||file.type.startsWith("video/")){showToast("Use the photo/video button for images and videos.");e.target.value="";return;}if(file.size>80*1024*1024){showToast("Please choose a file smaller than 80 MB.");e.target.value="";return;}STATE.pendingDocumentFile=file;const ext=getFileExtension(file.name);const icon=$("filePreviewIcon");icon.className=`file-type-icon file-preview-type-icon ${getFileIconClass(ext)}`;icon.textContent=(ext||"FILE").slice(0,5).toUpperCase();$("filePreviewName").textContent=file.name;$("filePreviewDetails").textContent=[formatBytes(file.size),file.type||"Unknown file type"].filter(Boolean).join(" • ");$("fileUploadPreviewOverlay").classList.remove("hidden");}
function cancelFilePreview(){STATE.pendingDocumentFile=null;$("documentFileInput").value="";closeModal("fileUploadPreviewOverlay");}
async function uploadAndSendDocument(){
  const file=STATE.pendingDocumentFile;
  if(!file||STATE.isUploadingDocument)return;
  if(!STATE.currentUser||!STATE.roomId){showToast("Please sign in again before sending files.");return;}
  STATE.isUploadingDocument=true;
  const replyToId=STATE.replyTargetMessage?.id||null;
  const btn=$("btnConfirmSendFile");setLoading(btn,true,"Uploading…");
  const safeName=String(file.name||"download").replace(/[\\/:*?"<>|]/g,"_").replace(/[\u0000-\u001f]/g,"_").slice(0,180)||"download";
  const path=`${STATE.roomId}/file_${Date.now()}_${safeName}`;
  try{
    const {error:upErr}=await STATE.supabase.storage.from(CONFIG.STORAGE.MEDIA_BUCKET).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
    if(upErr)throw upErr;
    await insertChatMessage({message_type:"file",storage_path:path,mime_type:file.type||"application/octet-stream",file_name:file.name||safeName,file_size:file.size},replyToId);
    cancelFilePreview();cancelReplyState();showToast("File sent");
  }catch(e){console.error("file upload/send",e);showToast(getSendErrorMessage(e,"File send"));}
  finally{STATE.isUploadingDocument=false;setLoading(btn,false);}
}
async function uploadAndSendMedia(){
  const files=STATE.pendingUploadFiles.length?STATE.pendingUploadFiles:(STATE.pendingUploadFile?[STATE.pendingUploadFile]:[]);
  if(!files.length||STATE.isUploading)return;
  if(!STATE.currentUser||!STATE.roomId){showToast("Please sign in again before sending media.");return;}
  STATE.isUploading=true;const replyToId=STATE.replyTargetMessage?.id||null;const btn=$("btnConfirmSendMedia");setLoading(btn,true,"Uploading…");
  const uploaded=[];
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i],safeName=String(file.name||`media-${Date.now()}`).replace(/[\\/:*?"<>|]/g,"_").slice(0,180);
      const path=`${STATE.roomId}/${Date.now()}_${i}_${safeName}`;
      const {error:upErr}=await STATE.supabase.storage.from(CONFIG.STORAGE.MEDIA_BUCKET).upload(path,file,{contentType:file.type,upsert:false});
      if(upErr)throw upErr;
      uploaded.push({storage_path:path,file_name:file.name||safeName,mime_type:file.type,message_type:file.type.startsWith("video/")?"video":"image",file_size:file.size});
    }
    if(uploaded.length===1){const item=uploaded[0];await insertChatMessage({message_type:item.message_type,storage_path:item.storage_path,mime_type:item.mime_type,file_name:item.file_name},replyToId);}
    else{
      // Keep a multi-photo/video carousel in one message row; attachment metadata is stored in content.
      const group={__rs_media_group_v1:true,items:uploaded};
      await insertChatMessage({message_type:"image",storage_path:uploaded[0].storage_path,mime_type:"application/x-rs-media-group",file_name:`${uploaded.length} media items`,content:JSON.stringify(group)},replyToId);
    }
    cancelMediaPreview();cancelReplyState();showToast(files.length>1?`${files.length} media items sent`:"Media sent");
  }catch(e){console.error("media upload/send",e);showToast(getSendErrorMessage(e,"Media send"));}
  finally{STATE.isUploading=false;setLoading(btn,false);}
}
function getMediaGroup(msg){if(!msg?.content)return null;try{const value=JSON.parse(msg.content);return value?.__rs_media_group_v1&&Array.isArray(value.items)?value:null;}catch{return null;}}
async function insertChatMessage(fields,replyToId=STATE.replyTargetMessage?.id||null){
  if(!STATE.supabase||!STATE.currentUser||!STATE.roomId)throw new Error("Your chat session is not ready. Sign in again.");
  const row={...fields,room_id:STATE.roomId,sender_key:STATE.currentUser.key,reply_to_id:replyToId||null};
  const {data,error}=await STATE.supabase.from("messages").insert(row).select("*").single();
  if(error)throw error;
  // Render immediately so the sender is not dependent on a Realtime packet arriving.
  // The ID check prevents duplicate bubbles if Realtime wins the race.
  if(data&&!STATE.messageById.has(data.id)){
    const message={...data,message_reactions:[],message_visibility:[]};
    STATE.messages.push(message);STATE.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    STATE.messageById.set(message.id,message);renderMessagesList(true);
  }
  return data;
}
function getSendErrorMessage(error,operation="Message send"){
  const raw=String(error?.message||error||"");
  if(/row.level security|permission denied|not allowed/i.test(raw))return `${operation} was blocked by Supabase permissions. Run extra/FULL_SUPABASE_SETUP.sql on ${CONFIG.SUPABASE_URL} and confirm Anonymous Sign-Ins is enabled.`;
  if(/foreign key|reply_to_id|valid_chat_reply_target/i.test(raw))return "The original message may no longer be available. Cancel the reply and try again.";
  return raw?`${operation} failed: ${raw.slice(0,170)}`:`${operation} failed. Check your connection and Supabase settings.`;
}
async function handleSendMessage(){
  if(STATE.isSendingMessage)return;
  const ta=$("messageTextArea"),text=ta.value.trim();
  if(!text)return;
  if(!STATE.currentUser||!STATE.roomId){showToast("Please sign in again before sending.");return;}
  STATE.isSendingMessage=true;
  const btn=$("btnSendMessage"),wasDisabled=btn.disabled;btn.disabled=true;btn.setAttribute("aria-busy","true");
  const replyToId=STATE.replyTargetMessage?.id||null;
  broadcastTypingState(false);
  try{
    if(STATE.editingMessageId){
      const msg=STATE.messageById.get(STATE.editingMessageId);
      if(!msg||msg.sender_key!==STATE.currentUser.key||Date.now()-new Date(msg.created_at).getTime()>300000){showToast("This message can no longer be edited.");cancelEditState();return;}
      const {error}=await STATE.supabase.rpc("edit_message",{p_message_id:msg.id,p_sender_key:STATE.currentUser.key,p_new_content:text});
      if(error)throw error;
      cancelEditState();
    }else{
      await insertChatMessage({message_type:"text",content:text},replyToId);
      if(replyToId)cancelReplyState();
    }
    ta.value="";ta.style.height="auto";onComposerInput();
  }catch(e){console.error("message send",e);showToast(getSendErrorMessage(e,"Message send"));}
  finally{STATE.isSendingMessage=false;btn.disabled=wasDisabled;btn.removeAttribute("aria-busy");}
}
function initiateReply(message=null){const msg=message&&message.id?message:STATE.messageById.get(STATE.selectedMessageId);if(!msg){showToast("Select a message to reply to.");return;}if(STATE.editingMessageId)cancelEditState();STATE.replyTargetMessage=msg;$("replyTargetAuthor").textContent=`Replying to ${msg.sender_key===STATE.currentUser.key?STATE.currentUser.name:STATE.counterpartUser.name}`;setExpandablePreview($("replyTargetText"),getMessageReplyPreview(msg),30);$("replyPreviewBanner").classList.remove("hidden");clearMessageSelection();$("messageTextArea").focus();}
function cancelReplyState(){STATE.replyTargetMessage=null;$("replyPreviewBanner").classList.add("hidden");$("replyTargetText").innerHTML="";}
function initiateEdit(){const msg=STATE.messageById.get(STATE.selectedMessageId);if(!msg||msg.sender_key!==STATE.currentUser.key||msg.message_type!=="text"||Date.now()-new Date(msg.created_at).getTime()>300000){showToast("Edit is only available for your text messages within 5 minutes.");return;}cancelReplyState();STATE.editingMessageId=msg.id;$("messageTextArea").value=msg.content||"";$("editTargetText").textContent=msg.content||"";$("editPreviewBanner").classList.remove("hidden");clearMessageSelection();onComposerInput();$("messageTextArea").focus();}
function cancelEditState(){STATE.editingMessageId=null;$("editPreviewBanner").classList.add("hidden");$("messageTextArea").value="";onComposerInput();}
async function copySelectedMessage(){const msg=STATE.messageById.get(STATE.selectedMessageId);if(msg?.content){try{await navigator.clipboard.writeText(msg.content);showToast("Copied");}catch{showToast("Copy unavailable");}}clearMessageSelection();}
function openDeleteChoicesModal(){const msg=STATE.messageById.get(STATE.selectedMessageId);if(!msg)return;const own=msg.sender_key===STATE.currentUser.key,within=Date.now()-new Date(msg.created_at).getTime()<=300000;$("btnDeleteForEveryone").classList.toggle("hidden",!(own&&within));$("deleteChoicesModal").classList.remove("hidden");}
async function executeDeleteForMe(){const id=STATE.selectedMessageId;if(!id)return;try{const {error}=await STATE.supabase.rpc("delete_message_for_me",{p_message_id:id,p_identity_key:STATE.currentUser.key});if(error)throw error;STATE.messages=STATE.messages.filter(m=>m.id!==id);STATE.messageById.delete(id);closeModal("deleteChoicesModal");clearMessageSelection();renderMessagesList(false);}catch(e){showToast(e.message||"Failed to delete for me.");}}
async function executeDeleteForEveryone(){const msg=STATE.messageById.get(STATE.selectedMessageId);if(!msg||msg.sender_key!==STATE.currentUser.key||Date.now()-new Date(msg.created_at).getTime()>300000){showToast("Only your own messages can be deleted for everyone within 5 minutes.");closeModal("deleteChoicesModal");return;}try{const {error}=await STATE.supabase.rpc("delete_message_everyone",{p_message_id:msg.id,p_sender_key:STATE.currentUser.key});if(error)throw error;closeModal("deleteChoicesModal");clearMessageSelection();showToast("Message deleted for everyone.");}catch(e){showToast(e.message||"Failed to delete for everyone.");}}
async function toggleMessageReaction(messageId,emoji){try{const {error}=await STATE.supabase.from("message_reactions").upsert({message_id:messageId,identity_key:STATE.currentUser.key,emoji},{onConflict:"message_id,identity_key"});if(error)throw error;const msg=STATE.messageById.get(messageId);if(msg){const list=msg.message_reactions||[];const idx=list.findIndex(r=>r.identity_key===STATE.currentUser.key);if(idx>=0)list[idx].emoji=emoji;else list.push({message_id:messageId,identity_key:STATE.currentUser.key,emoji});msg.message_reactions=list;renderSingleMessage(messageId);}}catch(e){showToast("Failed to save reaction.");}}
function renderSingleMessage(id){const old=document.querySelector(`.message-row[data-id="${CSS.escape(id)}"]`);const msg=STATE.messageById.get(id);if(!old||!msg)return;const fresh=createMessageBubbleElement(msg);old.replaceWith(fresh);if(fresh.classList.contains("counterpart"))STATE.seenObserver?.observe(fresh);}

async function listAllRoomStorageObjects(bucket,roomId){const out=[];let offset=0;const limit=1000;while(true){const {data,error}=await STATE.supabase.storage.from(bucket).list(roomId,{limit,offset,sortBy:{column:"name",order:"asc"}});if(error)throw error;if(!data?.length)break;for(const item of data){if(item?.name)out.push(`${roomId}/${item.name}`);}if(data.length<limit)break;offset+=limit;}return out;}
async function removeStoragePaths(bucket,paths){for(let i=0;i<paths.length;i+=100){const batch=paths.slice(i,i+100);if(!batch.length)continue;const {error}=await STATE.supabase.storage.from(bucket).remove(batch);if(error)throw error;}}
async function executeClearChatHistory(){
  if(STATE.currentUser?.key!=="first"){showToast("Only Shadow can clear the chat history.");closeModal("clearHistoryModal");return;}
  const btn=$("btnConfirmClearHistory");setLoading(btn,true,"Clearing…");
  let storageCleanupFailed=false;
  try{
    // Database clear is the primary operation. Storage cleanup must never make a successful clear look failed.
    const {data:rpcFiles,error}=await STATE.supabase.rpc("clear_chat_history",{p_requester_key:"first"});
    if(error)throw error;

    const referenced={"chat-media":[],"chat-voice":[]};
    if(Array.isArray(rpcFiles)){
      for(const item of rpcFiles){
        if(item?.deleted_storage_path&&referenced[item.bucket_name])referenced[item.bucket_name].push(item.deleted_storage_path);
      }
    }

    // Try to clean both buckets independently. Supabase Storage policies may reject LIST/DELETE;
    // that must not prevent the database-side chat clear from completing.
    const cleanBucket=async(bucket)=>{
      const paths=new Set(referenced[bucket]||[]);
      try{
        const listed=await listAllRoomStorageObjects(bucket,STATE.roomId);
        listed.forEach(path=>paths.add(path));
      }catch(e){
        storageCleanupFailed=true;
        console.warn(`Storage list failed for ${bucket}`,e);
      }
      if(paths.size){
        try{await removeStoragePaths(bucket,[...paths]);}
        catch(e){storageCleanupFailed=true;console.warn(`Storage delete failed for ${bucket}`,e);}
      }
    };

    await Promise.all([
      cleanBucket(CONFIG.STORAGE.MEDIA_BUCKET),
      cleanBucket(CONFIG.STORAGE.VOICE_BUCKET)
    ]);

    // Immediately reset the local chat UI after the database clear succeeds.
    STATE.messages=[];STATE.messageById.clear();STATE.mediaUrlCache.clear();STATE.selectedMessageId=null;STATE.replyTargetMessage=null;STATE.editingMessageId=null;
    closeModal("clearHistoryModal");clearMessageSelection();cancelReplyState();cancelEditState();renderMessagesList(true);

    if(storageCleanupFailed)showToast("Chat history cleared. Some stored files could not be removed by the current Storage permissions.");
    else showToast("Chat history, media and voice files cleared.");
  }catch(e){
    console.error("clear history",e);
    showToast(e?.message||"Failed to clear chat history.");
  }finally{setLoading(btn,false);}
}

async function openMediaGallery(){const grid=$("mediaGalleryGrid");grid.innerHTML="";const list=[];for(const msg of STATE.messages){if(msg.is_deleted_everyone||!(msg.message_type==="image"||msg.message_type==="video"))continue;const group=getMediaGroup(msg);if(group)group.items.forEach(item=>list.push({...item,groupMessageId:msg.id}));else list.push(msg);}if(!list.length){grid.innerHTML='<p class="empty-state">No shared media yet</p>';}else{const frag=document.createDocumentFragment();for(const m of list){const type=m.message_type||((m.mime_type||"").startsWith("video/")?"video":"image");const card=document.createElement("div");card.className="gallery-card";const el=type==="image"?document.createElement("img"):document.createElement("video");el.className="gallery-thumb-item";if(el.tagName==="VIDEO"){el.muted=true;el.playsInline=true;el.preload="metadata";}loadAuthorizedMediaUrl(m.storage_path,CONFIG.STORAGE.MEDIA_BUCKET).then(url=>{if(url)el.src=url;});el.onclick=()=>el.src&&openFullscreenMedia(el.src,type,m.file_name);const dl=document.createElement("a");dl.className="gallery-download";dl.href="#";dl.textContent="↓";dl.title="Download";dl.onclick=e=>{e.preventDefault();downloadStorageFile(m.storage_path,CONFIG.STORAGE.MEDIA_BUCKET,m.file_name||"media");};card.append(el,dl);frag.appendChild(card);}grid.appendChild(frag);}$("mediaGalleryOverlay").classList.remove("hidden");}
async function openVoiceGallery(){const list=$("voiceGalleryList");list.innerHTML="";const voices=STATE.messages.filter(m=>!m.is_deleted_everyone&&m.message_type==="voice");if(!voices.length){list.innerHTML='<p class="empty-state">No voice messages yet</p>';}else{const frag=document.createDocumentFragment();for(const m of voices){const item=document.createElement("div");item.className="voice-gallery-item";const a=document.createElement("div");a.className="voice-gallery-author";a.textContent=`${m.sender_key===STATE.currentUser.key?STATE.currentUser.name:STATE.counterpartUser.name} • ${new Date(m.created_at).toLocaleDateString("en-GB")}`;item.append(a,createInlineVoicePlayer(m));frag.appendChild(item);}list.appendChild(frag);}$("voiceGalleryOverlay").classList.remove("hidden");}
function openFullscreenMedia(url,type,fileName){const ov=$("fullscreenViewerOverlay"),img=$("fullscreenImage"),vid=$("fullscreenVideo"),dl=$("btnDownloadFullscreen");dl.href=url;dl.download=fileName||`media-${Date.now()}`;dl.onclick=e=>{if(!dl.href)return e.preventDefault();};$("fullscreenTitle").textContent=type==="video"?"Video":"Photo";if(type==="image"){vid.pause();vid.removeAttribute("src");vid.classList.add("hidden");img.src=url;img.classList.remove("hidden");}else{img.removeAttribute("src");img.classList.add("hidden");vid.src=url;vid.classList.remove("hidden");}ov.classList.remove("hidden");}
function closeFullscreen(){const v=$("fullscreenVideo");v.pause();v.removeAttribute("src");$("fullscreenImage").removeAttribute("src");closeModal("fullscreenViewerOverlay");}
function openReactionDetailsModal(reactions){const list=$("reactionDetailsList");list.innerHTML="";for(const r of reactions){const row=document.createElement("div");row.style.display="flex";row.style.alignItems="center";row.style.justifyContent="space-between";row.style.padding="8px 0";const name=document.createElement("span");name.textContent=`${r.emoji} ${r.identity_key===STATE.currentUser.key?STATE.currentUser.name:STATE.counterpartUser.name}`;row.appendChild(name);if(r.identity_key===STATE.currentUser.key){const b=document.createElement("button");b.className="btn-dialog-option";b.style.width="auto";b.style.padding="6px 9px";b.textContent="Remove";b.onclick=async()=>{const {error}=await STATE.supabase.from("message_reactions").delete().eq("id",r.id);if(error)showToast("Unable to remove reaction.");else{const msg=STATE.messageById.get(r.message_id);if(msg)msg.message_reactions=(msg.message_reactions||[]).filter(x=>x.id!==r.id);closeModal("reactionDetailsModal");if(msg)renderSingleMessage(msg.id);}};row.appendChild(b);}list.appendChild(row);}$("reactionDetailsModal").classList.remove("hidden");}

async function downloadStorageFile(path,bucket,fileName){try{const {data,error}=await STATE.supabase.storage.from(bucket).createSignedUrl(path,CONFIG.URL_TTL,{download:fileName||true});if(error||!data?.signedUrl)throw error||new Error("Unavailable");const a=document.createElement("a");a.href=data.signedUrl;a.download=fileName||"download";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();}catch(e){console.error(e);showToast("Download failed.");}}
async function downloadVoiceAsMp3(msg){try{showToast("Preparing MP3…");const url=await loadAuthorizedMediaUrl(msg.storage_path,CONFIG.STORAGE.VOICE_BUCKET,true);if(!url)throw new Error();const res=await fetch(url);if(!res.ok)throw new Error();const blob=await res.blob();if(blob.type.includes("mpeg")||blob.type.includes("mp3")){triggerBlobDownload(blob,changeExt(msg.file_name||`voice-${msg.id}.mp3`,`mp3`));return;}if(!window.lamejs)throw new Error("MP3 encoder unavailable");const arr=await blob.arrayBuffer(),ctx=new (window.AudioContext||window.webkitAudioContext)();const audio=await ctx.decodeAudioData(arr.slice(0));const mono=audio.numberOfChannels>1?mixToMono(audio):audio.getChannelData(0);const sampleRate=audio.sampleRate,mp3=new lamejs.Mp3Encoder(1,sampleRate,128),chunk=1152,parts=[];for(let i=0;i<mono.length;i+=chunk){const block=new Int16Array(Math.min(chunk,mono.length-i));for(let j=0;j<block.length;j++)block[j]=Math.max(-1,Math.min(1,mono[i+j]))*32767;const encoded=mp3.encodeBuffer(block);if(encoded.length)parts.push(new Int8Array(encoded));}const end=mp3.flush();if(end.length)parts.push(new Int8Array(end));const out=new Blob(parts,{type:"audio/mpeg"});triggerBlobDownload(out,changeExt(msg.file_name||`voice-${msg.id}.webm`,"mp3"));await ctx.close?.();}catch(e){console.error(e);showToast("This browser cannot convert this voice clip to MP3. Downloading original instead.");await downloadStorageFile(msg.storage_path,CONFIG.STORAGE.VOICE_BUCKET,msg.file_name||"voice.webm");}}
function mixToMono(audio){const out=new Float32Array(audio.length);for(let c=0;c<audio.numberOfChannels;c++){const ch=audio.getChannelData(c);for(let i=0;i<out.length;i++)out[i]+=ch[i]/audio.numberOfChannels;}return out;}function changeExt(name,ext){return String(name).replace(/\.[^.]+$/i,"")+`.${ext}`;}function triggerBlobDownload(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}

async function loadAuthorizedMediaUrl(path,bucket,refresh=false){if(!path)return null;const key=`${bucket}|${path}`,cached=STATE.mediaUrlCache.get(key);if(!refresh&&cached&&cached.expires>Date.now())return cached.url;const {data,error}=await STATE.supabase.storage.from(bucket).createSignedUrl(path,CONFIG.URL_TTL);if(error||!data?.signedUrl)return null;STATE.mediaUrlCache.set(key,{url:data.signedUrl,expires:Date.now()+CONFIG.URL_TTL*1000});return data.signedUrl;}

function setupSeenObserver(){if(STATE.seenObserver)STATE.seenObserver.disconnect();const root=$("chatMessages");if(!("IntersectionObserver" in window)){STATE.seenObserver=null;return;}STATE.seenObserver=new IntersectionObserver(entries=>{if(document.hidden||$("chatScreen").classList.contains("hidden"))return;for(const entry of entries){if(!entry.isIntersecting||entry.intersectionRatio<=0)continue;const rect=entry.intersectionRect;if(rect.height<Math.min(48,entry.boundingClientRect.height*.2))continue;const id=entry.target?.dataset?.id;const msg=id?STATE.messageById.get(id):null;if(msg&&msg.sender_key!==STATE.currentUser?.key)markMessageSeen(msg.id);}}, {root,threshold:[0,.15,.35]});}
function observeVisibleIncomingMessages(){if(!STATE.seenObserver||!STATE.currentUser||document.hidden||$("chatScreen").classList.contains("hidden"))return;document.querySelectorAll("#messagesList .message-row.counterpart").forEach(row=>STATE.seenObserver.observe(row));}
async function markMessageSeen(messageId){if(!messageId||STATE.seenMessageIds.has(messageId)||STATE.pendingSeenMessageIds.has(messageId)||!STATE.currentUser||document.hidden)return;STATE.pendingSeenMessageIds.add(messageId);try{const {data,error}=await STATE.supabase.rpc("mark_message_seen",{p_message_id:messageId});if(error)throw error;if(data!==false)STATE.seenMessageIds.add(messageId);}catch(e){console.warn("Unable to save seen receipt",e);if(!STATE.seenSchemaWarningShown){STATE.seenSchemaWarningShown=true;showToast("Apply the follow-up Supabase SQL to enable seen receipts.");}}finally{STATE.pendingSeenMessageIds.delete(messageId);}}
function handleRealtimeSeenReceiptChange(payload){const receipt=payload?.new;if(!receipt||receipt.seen_by_identity_key!==STATE.counterpartUser?.key)return;STATE.seenByCounterpart.add(receipt.message_id);if(STATE.messageById.has(receipt.message_id))renderSingleMessage(receipt.message_id);}

function subscribeRealtime(){
  if(STATE.realtimeChannel)STATE.supabase.removeChannel(STATE.realtimeChannel);
  const channel=STATE.supabase.channel(`rs_room_${STATE.roomId}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`room_id=eq.${STATE.roomId}`},handleRealtimeMessageChange)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages",filter:`room_id=eq.${STATE.roomId}`},handleRealtimeMessageChange)
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"messages",filter:`room_id=eq.${STATE.roomId}`},handleRealtimeMessageChange)
    .on("postgres_changes",{event:"*",schema:"public",table:"message_reactions"},handleRealtimeReactionChange)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"message_seen_receipts"},handleRealtimeSeenReceiptChange)
    .on("postgres_changes",{event:"*",schema:"public",table:"presence"},handleRealtimePresenceChange)
    .on("broadcast",{event:"typing"},handleRealtimeActivity)
    .on("broadcast",{event:"recording"},handleRealtimeActivity);
  STATE.realtimeChannel=channel.subscribe(status=>{
    const b=$("connectionBanner");
    b.classList.toggle("hidden",status==="SUBSCRIBED");
    if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setTimeout(()=>{if(STATE.currentUser&&STATE.roomId)subscribeRealtime();},2000);
  });
}
function handleRealtimeMessageChange(payload){
  if(!payload?.eventType||!STATE.roomId)return;
  if(payload.eventType==="INSERT"){
    const m=payload.new;if(!m||m.room_id!==STATE.roomId||STATE.messageById.has(m.id))return;
    // Follow new messages only if the user was already at the bottom.
    // Otherwise preserve their reading position and offer a jump-to-latest button.
    const shouldStickToBottom=isNearBottom();
    const message={...m,message_reactions:m.message_reactions||[],message_visibility:m.message_visibility||[]};STATE.messages.push(message);STATE.messageById.set(message.id,message);STATE.messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    if(!shouldStickToBottom&&message.sender_key!==STATE.currentUser?.key){STATE.pendingNewMessagesBelow=(STATE.pendingNewMessagesBelow||0)+1;updateJumpToLatestButton();}
    renderMessagesList(shouldStickToBottom);return;
  }
  if(payload.eventType==="UPDATE"){
    const id=payload.new?.id;if(!id)return;
    const idx=STATE.messages.findIndex(x=>x.id===id);
    if(idx<0){loadMessages();return;}
    STATE.messages[idx]={...STATE.messages[idx],...payload.new};STATE.messageById.set(id,STATE.messages[idx]);renderSingleMessage(id);return;
  }
  if(payload.eventType==="DELETE"){
    const id=payload.old?.id;if(!id)return;
    STATE.messages=STATE.messages.filter(x=>x.id!==id);STATE.messageById.delete(id);renderMessagesList(false);
  }
}
function handleRealtimeReactionChange(payload){const id=payload.new?.message_id||payload.old?.message_id;if(!id||!STATE.messageById.has(id))return;loadMessageReactions(id);}
async function loadMessageReactions(messageId){const {data,error}=await STATE.supabase.from("message_reactions").select("*").eq("message_id",messageId);if(error)return;const m=STATE.messageById.get(messageId);if(!m)return;m.message_reactions=data||[];renderSingleMessage(messageId);}
function handleRealtimePresenceChange(payload){const row=payload.new||payload.old;if(!row||row.identity_key!==STATE.counterpartUser.key)return;updatePresenceStatusUI(row.is_online,row.last_seen,false,row.updated_at);}
async function loadCounterpartPresence(){const {data,error}=await STATE.supabase.from("presence").select("identity_key,is_online,last_seen,updated_at").eq("identity_key",STATE.counterpartUser.key).maybeSingle();if(!error&&data)updatePresenceStatusUI(data.is_online,data.last_seen,true,data.updated_at);}
function updatePresenceStatusUI(isOnline,lastSeen,bootstrap=false,updatedAt=null){const status=$("counterpartStatus"),dot=$("counterpartStatusDot");let fresh=!!isOnline;const stamp=updatedAt||lastSeen;if(fresh&&stamp&&Date.now()-new Date(stamp).getTime()>CONFIG.PRESENCE_STALE_MS)fresh=false;dot.classList.toggle("online",fresh);dot.classList.toggle("offline",!fresh);status.classList.toggle("online",fresh);if(fresh){status.textContent="Online";}else if(lastSeen){status.textContent=`Last seen ${formatLastSeen(new Date(lastSeen))}`;}else status.textContent="Offline";STATE.presenceBootstrapped=true;}
function formatLastSeen(d){const now=new Date(),same=now.toDateString()===d.toDateString(),y=new Date(now);y.setDate(now.getDate()-1);if(same)return`today at ${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;if(y.toDateString()===d.toDateString())return`yesterday at ${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;return`${d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})} at ${d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`;}
function startPresenceHeartbeat(){sendHeartbeat(true);clearInterval(STATE.heartbeatIntervalId);STATE.heartbeatIntervalId=setInterval(()=>{if(document.hidden)return;sendHeartbeat(true);},15000);}
async function sendHeartbeat(isOnline){if(!STATE.currentUser)return;try{await STATE.supabase.rpc("update_presence_heartbeat",{p_identity_key:STATE.currentUser.key,p_is_online:isOnline});}catch(e){console.warn("presence",e);}}
function scrollToBottom(smooth=true){const c=$("chatMessages");c.scrollTo({top:c.scrollHeight,behavior:smooth?"smooth":"auto"});if(!smooth){STATE.pendingNewMessagesBelow=0;updateJumpToLatestButton();}else{setTimeout(()=>{if(isNearBottom()){STATE.pendingNewMessagesBelow=0;updateJumpToLatestButton();}},350);}}
