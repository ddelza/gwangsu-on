// =============================================
// 광수 Online 교무실 — 공용 로그인 게이트
// 모든 페이지 <head>에 `<style>body{visibility:hidden}</style>`를,
// <body> 끝(또는 아무 곳)에 `<script type="module" src="auth-gate.js"></script>`를 추가하면
// 이 파일이 로그인 화면을 띄우고, 통과한 사용자에게만 본문을 보여준다.
//
// 판정 방식: gwangsu.ms.kr 도메인 계정이면 일단 허용하되, 학생 이메일 패턴
// (YY-###@gwangsu.ms.kr, 예: 24-027@gwangsu.ms.kr)에 해당하면 거부한다.
// 교사 로컬파트는 형식이 고정돼 있지 않아(t027 외에도 다양) "교사 패턴 매칭"이 아니라
// "학생 패턴 제외"로 판정한다.
//
// ⚠️ 이 파일만으로는 "화면 가리기"에 불과하다. 실제 데이터 보호는 Firebase Realtime
// Database 보안 규칙에서 auth != null && 같은 조건을 걸어야 완성된다(별도 작업).
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_D2Wi944YQL-1rCdgeNU-tD8lpMek_wM",
  authDomain: "gwangsu-on.firebaseapp.com",
  databaseURL: "https://gwangsu-on-default-rtdb.firebaseio.com",
  projectId: "gwangsu-on",
  storageBucket: "gwangsu-on.firebasestorage.app",
  messagingSenderId: "684885628658",
  appId: "1:684885628658:web:b471726b604754a82b626b",
  measurementId: "G-6X5DH4EP5N",
};

const SCHOOL_DOMAIN = "gwangsu.ms.kr";
// 학생 이메일 로컬파트 패턴: 두 자리 입학연도 + '-' + 세 자리 번호 (예: 24-027)
const STUDENT_LOCAL_RE = /^\d{2}-\d{3}$/;

function isAllowedEmail(email) {
  if (!email) return false;
  const [local, domain] = email.toLowerCase().split("@");
  if (domain !== SCHOOL_DOMAIN) return false;
  return !STUDENT_LOCAL_RE.test(local);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: SCHOOL_DOMAIN });

// ── 게이트 UI ──────────────────────────────
const overlay = document.createElement("div");
overlay.id = "gwangsuAuthGate";
overlay.style.cssText = [
  "visibility:visible", "position:fixed", "inset:0", "z-index:99999",
  "display:flex", "align-items:center", "justify-content:center",
  "background:#f5f6f8", "font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
].join(";");
overlay.innerHTML = `
  <div style="background:#fff;border-radius:16px;padding:40px 32px;max-width:360px;width:90%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
    <img src="logo.png" alt="" style="height:48px;margin-bottom:16px" onerror="this.style.display='none'">
    <h1 style="font-size:1.1rem;margin:0 0 6px;color:#1a3d7c">광수 Online 교무실</h1>
    <p id="gwangsuAuthMsg" style="font-size:0.85rem;color:#888;margin:0 0 20px;line-height:1.5">교직원 전용 페이지입니다.<br>학교 구글 계정으로 로그인해주세요.</p>
    <button id="gwangsuAuthBtn" style="width:100%;padding:12px;border:none;border-radius:10px;background:#1a3d7c;color:#fff;font-size:0.92rem;font-weight:700;cursor:pointer">Google로 로그인</button>
  </div>
`;
document.documentElement.appendChild(overlay);

const msgEl = () => document.getElementById("gwangsuAuthMsg");
const btnEl = () => document.getElementById("gwangsuAuthBtn");

function showLoggedOutState(errorText) {
  overlay.style.display = "flex";
  document.body.style.visibility = "hidden";
  if (errorText) msgEl().innerHTML = `<span style="color:#c0392b">${errorText}</span>`;
  btnEl().disabled = false;
  btnEl().textContent = "Google로 로그인";
}

function showDeniedState(email) {
  overlay.style.display = "flex";
  document.body.style.visibility = "hidden";
  msgEl().innerHTML = `<span style="color:#c0392b">${email ? email + "<br>" : ""}학생 계정으로는 접근할 수 없습니다.<br>교직원 계정으로 다시 로그인해주세요.</span>`;
  btnEl().disabled = false;
  btnEl().textContent = "다른 계정으로 로그인";
}

async function doSignIn() {
  btnEl().disabled = true;
  btnEl().textContent = "로그인 중...";
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // 팝업이 막히는 환경(카카오톡 인앱 브라우저 등)에서는 리디렉션 방식으로 재시도
    if (err && (err.code === "auth/popup-blocked" || err.code === "auth/cancelled-popup-request" || err.code === "auth/operation-not-supported-in-this-environment")) {
      try { await signInWithRedirect(auth, provider); return; } catch (e2) { /* fallthrough */ }
    }
    showLoggedOutState("로그인에 실패했습니다. 다시 시도해주세요.");
  }
}
btnEl().addEventListener("click", doSignIn);

// 리디렉션 로그인 플로우가 이 페이지로 돌아왔을 때의 결과 처리(팝업 실패 폴백용)
getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, (user) => {
  if (!user) { showLoggedOutState(); return; }
  if (!isAllowedEmail(user.email)) {
    signOut(auth).finally(() => showDeniedState(user.email));
    return;
  }
  overlay.style.display = "none";
  document.body.style.visibility = "";
});

// 다른 페이지 스크립트가 필요하면 쓸 수 있도록 최소한만 전역에 노출
window.gwangsuAuth = { auth, signOut: () => signOut(auth) };
