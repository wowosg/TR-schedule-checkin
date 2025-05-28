import dotenv from "dotenv";
import fetch from "node-fetch";
import schedule from "node-schedule";
import { DateTime } from "luxon";

dotenv.config();

const bookingReference = process.env.BOOKING_REF;
const departing = process.env.DEPARTING;

const apiUrl = "https://apigw.singaporeair.com/chopemyseat/booking/retrieval";

// 發送 API 請求的函數
async function fetchApiData() {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: process.env.TOKEN,
        "content-type": "application/json",
        "x-api-key": process.env.X_API_KEY,
        "x-scoot-appsource": process.env.X_SCOOT_APP_SOURCE,
        "x-scoot-client-environment": process.env.X_SCOOT_ENV,
        "x-scoot-client-version": process.env.X_SCOOT_VERSION,
      },
      body: JSON.stringify({ bookingReference, departing }),
    });

    const { data } = await response.json();
    return data;
  } catch (error) {
    console.error("❌ 請求失敗:", error);
    return null;
  }
}

// 發送 request 的函數
async function sendRequest() {
  console.log("發送 request 中...");

  const data = await fetchApiData();

  if (!data) return false;

  if (data.status.isSuccess) {
    console.log("✅ 成功收到回應：", data);
    return true;
  } else {
    console.log("❌ 尚未開放：", data.status.errorMessage);
    return false;
  }
}

function retrySendRequest() {
  let retryCount = 0;
  const maxRetries = 5;
  const interval = 50;

  const intervalId = setInterval(() => {
    console.log(`🚀 發送第 ${retryCount + 1} 次 request`);
    sendRequest();

    retryCount++;
    if (retryCount >= maxRetries) {
      clearInterval(intervalId);
      console.log("✅ 已完成所有 retry 次數，退出程式");
      return;
    }
  }, interval);
}

// 讀取開放時間並排程
async function scheduleCheckIn() {
  console.log("讀取開放時間中...");

  const data = await fetchApiData();

  console.log("🔍 API 回傳結果：", data);
  console.log("\n-----------------------------\n");

  if (!data) {
    console.error("❌ 無法取得開放時間資料");
    return;
  }

  if (data.passengers?.length > 0) {
    console.log("⚠️ 先前已成功報到過囉");
    return;
  }

  if (!data.openForCheckin) {
    console.error("❌ 無法取得開放報到時間", data.openForCheckin);
    return;
  }

  // 使用 Luxon 解析開放報到時間
  const openTimeStr = data.openForCheckin; // 例如 "04-17-2025 21:30"
  const openTime = DateTime.fromFormat(openTimeStr, "MM-dd-yyyy HH:mm", {
    zone: "Asia/Singapore",
  });

  if (!openTime.isValid) {
    console.error("❌ 無法解析開放報到時間", openTime.invalidExplanation);
    return;
  }

  console.log("\n-----------------------------\n");
  console.log("📅 已排程於：", openTime.toString());

  // 設定排程
  schedule.scheduleJob(openTime.toJSDate(), () => {
    console.log("⌛ 時間到，延遲 10ms 再發送");
    setTimeout(() => retrySendRequest(), 10);
  });
}

scheduleCheckIn();
