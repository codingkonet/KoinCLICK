
const API="http://localhost:3000";

function register(){
 fetch(API+"/register",{
  method:"POST",
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email,password})
 }).then(r=>r.json()).then(d=>alert(d.message));
}

function login(){
 fetch(API+"/login",{
  method:"POST",
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email,password})
 }).then(r=>r.json()).then(d=>{
  if(d.message==="Login successful"){
   localStorage.setItem("user",email.value);
   location=d.isAdmin?"admin.html":"chat.html";
  } else alert(d.message);
 });
}

function sendMessage(){
 const email=localStorage.getItem("user");
 chatBox.innerHTML+=`<div class="msg">🧑 ${message.value}</div>`;

 const es=new EventSource(API+"/chat-stream");
 es.onmessage=e=>{
  if(!chatBox.lastElementChild||!chatBox.lastElementChild.classList.contains("bot"))
    chatBox.innerHTML+=`<div class="msg bot">🤖 </div>`;
  chatBox.lastElementChild.innerHTML+=e.data;
 };

 fetch(API+"/chat-stream",{
  method:"POST",
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email,message:message.value})
 });

 message.value="";
}

function loadAdmin(){
 fetch(API+"/admin/chats").then(r=>r.json())
 .then(d=>adminBox.textContent=JSON.stringify(d,null,2));
}
