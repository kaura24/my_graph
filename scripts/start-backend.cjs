/**
 * start-backend.js
 * 포트 정리 → 백엔드 시작 → 헬스체크 대기 → 성공 시 exit 0
 * npm run dev:backend-wait 에서 호출됨
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = 8000;
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/docs`;
const MAX_WAIT_SEC = 120;
const POLL_INTERVAL_MS = 2000;
const PYTHON = path.resolve(__dirname, "..", "python", ".venv", "Scripts", "python.exe");
const APP_DIR = path.resolve(__dirname, "..", "python");

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
}

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port} " | findstr LISTENING`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const pids = new Set();
    for (const line of out.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
        log(`  PID ${pid} 종료`);
      } catch {}
    }
    if (pids.size > 0) {
      log(`포트 ${port}: ${pids.size}개 프로세스 정리 완료`);
    }
  } catch {
    // findstr 매치 없으면 exit 1 → 포트 이미 비어있음
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 3000 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend() {
  const start = Date.now();
  let attempt = 0;
  while ((Date.now() - start) / 1000 < MAX_WAIT_SEC) {
    attempt++;
    const ok = await healthCheck();
    if (ok) {
      log(`백엔드 정상 응답 (${attempt}번째 시도, ${((Date.now() - start) / 1000).toFixed(1)}초)`);
      return true;
    }
    if (attempt <= 3) {
      log("백엔드 시작 대기 중 (모델 로딩 ~60초)...");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

async function main() {
  log("=== 백엔드 시작 프로세스 ===");

  // 1) 기존 프로세스 정리
  log("1. 포트 정리");
  killPort(PORT);
  killPort(8011);
  await new Promise((r) => setTimeout(r, 1000));

  // 2) 백엔드 시작
  log("2. uvicorn 시작");
  const child = spawn(
    PYTHON,
    ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", String(PORT), "--reload"],
    {
      cwd: APP_DIR,
      stdio: "inherit",
      detached: false,
    }
  );
  child.on("error", (err) => {
    log(`백엔드 시작 실패: ${err.message}`);
    process.exit(1);
  });

  // 3) 헬스체크 대기
  log("3. 헬스체크 대기");
  const ok = await waitForBackend();
  if (!ok) {
    log("백엔드가 제한시간 내 응답하지 않았습니다.");
    process.exit(1);
  }

  log("=== 백엔드 준비 완료 ===");

  // 4) 프론트엔드 시작
  log("4. Vite 프론트엔드 시작");
  const projectRoot = path.resolve(__dirname, "..");
  const vite = spawn("node_modules\\.bin\\vite", [], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });
  vite.on("error", (err) => {
    log(`프론트엔드 시작 실패: ${err.message}`);
  });

  // 프론트 또는 백엔드 종료 시 양쪽 모두 정리
  function cleanup() {
    try { child.kill(); } catch {}
    try { vite.kill(); } catch {}
    process.exit(0);
  }
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  child.on("exit", cleanup);
}

main();
