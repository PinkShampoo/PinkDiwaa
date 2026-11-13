"use strict";



// ============================================

// PINK RUSH SPORTS DAY

// Firebase Realtime Database Shared Edition

// ============================================



const KEY = "pinkRushApplicantsV2";

const LIMIT_KEY = "pinkRushLimitsV2";

const SESSION_KEY = "pinkRushAdminSession";

const STAFF_KEY = "pinkRushStaffV2";
const ACTIVITY_KEY = "pinkRushActivitiesV1";
const CATEGORY_LIMIT_KEY = "pinkRushCategoryLimitsV1";



// --------------------------------------------

// ACTIVITIES

// --------------------------------------------



const SPORT_CATEGORIES = ["ชาย ม.1", "ชาย ม.ต้น", "ชาย ม.ปลาย", "หญิง ม.1", "หญิง ม.ต้น", "หญิง ม.ปลาย"];
const NO_CATEGORY_SPORTS = ["muay-khita", "cheer"];
function defaultCategoriesForActivity(activity) {
  return NO_CATEGORY_SPORTS.includes(activity?.id) || ["คีตะมวยไทย", "หลีด"].includes(activity?.name)
    ? [] : [...SPORT_CATEGORIES];
}

let activities = []; // Firebase is the only source of activity records.


// --------------------------------------------

// HELPERS

// --------------------------------------------



function makeId() {

  return Date.now().toString(36) +

    Math.random().toString(36).slice(2, 8);

}



function escapeHTML(value) {

  return String(value ?? "").replace(/[&<>"']/g, char => ({

    "&": "&amp;",

    "<": "&lt;",

    ">": "&gt;",

    '"': "&quot;",

    "'": "&#39;"

  })[char]);

}

// Firebase Realtime Database forbids . # $ / [ ] in object keys.
// Keep human-readable names in application state, and encode every key only
// at the Firebase boundary so Thai category labels remain unchanged in the UI.
function encodeFirebaseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(encodeFirebaseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const encodedKey = "__prk_" + Array.from(new TextEncoder().encode(key), byte => byte.toString(16).padStart(2, "0")).join("");
    return [encodedKey, encodeFirebaseObjectKeys(child)];
  }));
}

function decodeFirebaseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(decodeFirebaseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    let decodedKey = key;
    if (key.startsWith("__prk_") && /^[0-9a-f]+$/i.test(key.slice(6)) && key.length > 6 && key.length % 2 === 0) {
      try {
        const hex = key.slice(6);
        const bytes = new Uint8Array(hex.match(/.{2}/g).map(pair => parseInt(pair, 16)));
        decodedKey = new TextDecoder().decode(bytes);
      } catch (error) {
        console.warn("Could not decode Firebase object key:", key, error);
      }
    }
    return [decodedKey, decodeFirebaseObjectKeys(child)];
  }));
}



// Firebase-only mode: browser Local Storage is intentionally not used.
// These compatibility helpers keep the existing code paths working without
// persisting any application data to the device.
function loadJSON(key, fallback) {
  return fallback;
}

function saveJSON(key, value) {
  // Intentionally disabled. Firebase Realtime Database is the only data store.
}


// QR images are stored on the activity record (not by competition category).
// Keep each optimized PNG small so Firebase and browser storage remain practical.
const QR_MAX_FILE_BYTES = 8 * 1024 * 1024;
const QR_MAX_STORED_BYTES = 220 * 1024;

function fileToQrDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("กรุณาเลือกไฟล์รูปภาพ")); return;
    }
    if (file.size > QR_MAX_FILE_BYTES) {
      reject(new Error("รูปมีขนาดใหญ่เกิน 8 MB")); return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("ไฟล์รูปภาพไม่ถูกต้อง"));
      image.onload = () => {
        const encode = maxSide => {
          const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d", { alpha: false });
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingEnabled = false;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/png");
        };
        try {
          let dataUrl = encode(900);
          let bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4);
          if (bytes > QR_MAX_STORED_BYTES) { dataUrl = encode(650); bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4); }
          if (bytes > QR_MAX_STORED_BYTES) { dataUrl = encode(480); bytes = Math.ceil((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4); }
          if (bytes > QR_MAX_STORED_BYTES) { reject(new Error("รูป QR Code มีขนาดใหญ่เกินไปหลังปรับขนาด กรุณาใช้รูปที่เรียบง่ายหรือมีขนาดเล็กลง")); return; }
          resolve(dataUrl);
        } catch (error) { reject(error); }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function saveActivityQr(index, dataUrl) {
  const activity = activities[index];
  if (!activity) throw new Error("ไม่พบกิจกรรมที่เลือก");
  const previous = activity.qrImage || "";
  activity.qrImage = dataUrl;
  try {
    saveActivities();
  } catch (error) {
    activity.qrImage = previous;
    throw new Error("พื้นที่จัดเก็บในเบราว์เซอร์ไม่เพียงพอ กรุณาลบ QR Code เก่าหรือใช้รูปขนาดเล็กลง");
  }
  renderActivityAdmin();
  if (currentActivity === activity.name) renderSportQr(activity);
}

function renderSportQr(activity) {
  const section = getElement("sportQrSection");
  const image = getElement("sportQrImage");
  const openLink = getElement("sportQrOpen");
  if (!section || !image || !openLink) return;
  if (activity && typeof activity.qrImage === "string" && activity.qrImage.startsWith("data:image/")) {
    image.src = activity.qrImage;
    openLink.href = activity.qrImage;
    section.classList.remove("hidden");
  } else {
    image.removeAttribute("src");
    openLink.removeAttribute("href");
    section.classList.add("hidden");
  }
}

// Activities are synchronized per changed record. Never replace the whole collection:
// this prevents an old browser tab from deleting activities created on another device.
let lastKnownActivities = new Map();
let activitiesCloudLoaded = false;
function cleanFirebaseValue(value) {
  if (Array.isArray(value)) {
    // Firebase Realtime Database rejects undefined array entries.
    return value.filter(item => item !== undefined).map(cleanFirebaseValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanFirebaseValue(item)])
    );
  }
  return value;
}

function normalizeActivityForFirebase(activity) {
  const safe = cleanFirebaseValue({ ...activity });
  safe.categories = Array.isArray(safe.categories)
    ? safe.categories.filter(category => typeof category === "string" && category.trim())
    : defaultCategoriesForActivity(safe);
  safe.splitCategories = Boolean(safe.splitCategories && safe.categories.length);
  return safe;
}

function saveActivities() {
  activities = activities.map(normalizeActivityForFirebase);
  saveJSON(ACTIVITY_KEY, activities);
  if (!cloudReady || !activitiesCloudLoaded) return;

  const current = new Map(activities.map(item => [String(item.id), normalizeActivityForFirebase(item)]));
  const baseline = new Map(lastKnownActivities);
  const changed = [];
  for (const [id, item] of current) {
    if (stableJson(item) !== stableJson(baseline.get(id))) changed.push([id, item]);
  }
  const removed = [...baseline.keys()].filter(id => !current.has(id));
  if (!changed.length && !removed.length) return;

  // Update only records changed by this device. A transaction prevents a stale
  // snapshot on another device from blocking a legitimate activity edit.
  queueCloudWrite(async () => {
    const ref = db.ref("pinkRush/data/activities");
    for (const [id, item] of changed) {
      const safeItem = normalizeActivityForFirebase({ ...item, id });
      await ref.child(id).transaction(() => safeItem, undefined, false);
      lastKnownActivities.set(id, safeItem);
    }
    for (const id of removed) {
      await ref.child(id).remove();
      lastKnownActivities.delete(id);
    }
  });
}


function getElement(id) {

  return document.getElementById(id);

}



function isActivitySplit(activity) {
  if (!activity) return false;
  return typeof activity.splitCategories === "boolean"
    ? activity.splitCategories && Array.isArray(activity.categories) && activity.categories.length > 0
    : Array.isArray(activity.categories) && activity.categories.length > 0;
}

function getActivity(name) {

  return activities.find(item => item.name === name);

}



function getLimit(name) {
  const value = Number(limits[name]);
  return Number.isFinite(value) && value >= 0 ? value : 30;
}

function getCategoryLimit(name, category) {
  const value = Number(categoryLimits?.[name]?.[category]);
  return Number.isFinite(value) && value >= 0 ? value : getLimit(name);
}

function getActivityCount(name, category) {
  return applicants.filter(item => item.activity === name && (category === undefined || (item.category || "") === category)).length;
}

function getCategoryCount(name, category) {
  return getActivityCount(name, category);
}



function saveData() {
  // Firebase Realtime Database is the only application data store.
  saveJSON(KEY, applicants);
  saveJSON(LIMIT_KEY, limits);
  saveJSON(CATEGORY_LIMIT_KEY, categoryLimits);
  if (cloudReady) {
    queueCloudWrite(async () => {
      await syncCollection("applicants", applicants);
      await db.ref("pinkRush/data/settings").update({ limits: encodeFirebaseObjectKeys(limits), categoryLimits: encodeFirebaseObjectKeys(categoryLimits) });
    });
  }
}

function saveStaff() {
  saveJSON(STAFF_KEY, staff);
  if (cloudReady) queueCloudWrite(() => syncCollection("staff", staff));
}



// --------------------------------------------

// LOAD DATA

// --------------------------------------------



let applicants = loadJSON(KEY, []);

let limits = loadJSON(LIMIT_KEY, {});
let categoryLimits = loadJSON(CATEGORY_LIMIT_KEY, {});

let staff = loadJSON(STAFF_KEY, []);



if (!Array.isArray(applicants)) applicants = [];

if (!Array.isArray(staff)) staff = [];



if (!limits || typeof limits !== "object" || Array.isArray(limits)) limits = {};
if (!categoryLimits || typeof categoryLimits !== "object" || Array.isArray(categoryLimits)) categoryLimits = {};



applicants = applicants.map(person => ({

  id: String(person.id || makeId()),

  name: person.name || "",

  classroom: person.classroom || "",

  number: person.number || "",

  phone: person.phone || "",

  note: person.note || "",

  activity: person.activity || "",

  category: person.category || "",

  status: ["ผ่าน", "ไม่ผ่าน", "รอตรวจสอบ"].includes(person.status)

    ? person.status

    : "รอตรวจสอบ",

  created: person.created || new Date().toISOString()

}));



staff = staff.map(person => ({

  id: String(person.id || makeId()),

  activity: person.activity || "",

  name: person.name || "",

  phone: person.phone || "",

  role: person.role || ""

}));



saveJSON(KEY, applicants);
saveJSON(STAFF_KEY, staff);

// ============================================
// FIREBASE REALTIME DATABASE CLOUD SYNC
// ============================================
let db = null;
let cloudReady = false;
let cloudWriteQueue = Promise.resolve();
let cloudUnsubscribers = [];
let cloudStatusNode = null;

function setCloudStatus(message, state = "loading") {
  if (!cloudStatusNode) {
    cloudStatusNode = document.createElement("div");
    cloudStatusNode.id = "cloudStatus";
    cloudStatusNode.setAttribute("role", "status");
    cloudStatusNode.style.cssText = "position:fixed;z-index:9999;right:14px;bottom:14px;padding:9px 14px;border-radius:12px;background:#fff;color:#8b315d;box-shadow:0 4px 20px #0002;font:500 13px Kanit,sans-serif;border:1px solid #f4c4d9;max-width:calc(100vw - 28px)";
    document.body.appendChild(cloudStatusNode);
  }
  cloudStatusNode.textContent = message;
  cloudStatusNode.style.borderColor = state === "online" ? "#8bd4b0" : state === "error" ? "#e9a1a1" : "#f4c4d9";
}

function queueCloudWrite(task) {
  cloudWriteQueue = cloudWriteQueue.then(task).catch(error => {
    console.error("Realtime Database write failed:", error);
    setCloudStatus("บันทึกออนไลน์ไม่สำเร็จ: " + (error.code || error.message || "ตรวจสอบ Rules"), "error");
  });
  return cloudWriteQueue;
}

function recordsToObject(records) {
  const result = {};
  records.forEach(record => {
    const id = String(record.id || makeId());
    result[id] = { ...record, id };
  });
  return result;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function syncCollection(collectionName, records) {
  if (!db || !cloudReady) return;
  await db.ref("pinkRush/data/" + collectionName).set(recordsToObject(records));
}

function refreshAllViews() {
  renderHomeActivities();
  renderActivities();
  renderStaff();
  if (isAdmin()) {
    renderAdmin();
    renderActivityAdmin();
    renderLimits();
    renderStaffAdmin();
  }
  if (currentActivity && getActivity(currentActivity)) {
    const activity = getActivity(currentActivity);
    const detailPage = getElement("sportPage");
    if (detailPage && !detailPage.classList.contains("hidden")) {
      getElement("sportIcon").textContent = activity.icon || "🏅";
      getElement("sportTitle").textContent = activity.name || "";
      getElement("sportDescription").textContent = activity.desc || "";
      getElement("activityName").value = activity.name || "";
      const categoryWrap = getElement("sportCategoryWrap");
      const categorySelect = getElement("sportCategory");
      const previousCategory = categorySelect.value;
      const categories = isActivitySplit(activity) ? activity.categories : [];
      categoryWrap.classList.toggle("hidden", categories.length === 0);
      categorySelect.required = categories.length > 0;
      categorySelect.innerHTML = categories.length
        ? '<option value="">เลือกประเภทการแข่งขัน</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("")
        : '<option value="">ไม่แยกประเภท</option>';
      if (categories.includes(previousCategory)) categorySelect.value = previousCategory;
      renderSportQr(activity);
    }
    updateCapacity(currentActivity);
  } else if (currentActivity) {
    currentActivity = "";
    showPage("activities");
  }
}


// One-time upgrade: add separate M.1 categories and move existing M.1
// applicants out of the old M.ต้น categories without losing their records.
async function migrateM1CategoriesOnce() {
  if (!db || !cloudReady) return;
  const systemRef = db.ref("pinkRush/system");
  const versionSnapshot = await systemRef.child("schemaVersion").once("value");
  if (Number(versionSnapshot.val() || 0) >= 5) return;

  const root = db.ref("pinkRush/data");
  const [applicantsSnapshot, activitiesSnapshot, settingsSnapshot] = await Promise.all([
    root.child("applicants").once("value"),
    root.child("activities").once("value"),
    root.child("settings").once("value")
  ]);

  const applicantData = applicantsSnapshot.val() || {};
  const activityData = activitiesSnapshot.val() || {};
  const settings = settingsSnapshot.val() || {};
  const applicantUpdates = {};
  const activityUpdates = {};
  const nextCategoryLimits = decodeFirebaseObjectKeys(settings.categoryLimits || {});
  let moved = 0;
  let changedActivities = 0;

  const isM1Class = classroom => {
    const value = String(classroom || "").trim();
    return /^(?:ม\.?\s*1|ม\s*1)(?:\s|\/|-|$)/i.test(value) ||
      /มัธยมศึกษาปีที่\s*1/.test(value);
  };

  for (const [id, person] of Object.entries(applicantData)) {
    if (!person || !isM1Class(person.classroom)) continue;
    if (person.category === "ชาย ม.ต้น") {
      applicantUpdates[id + "/category"] = "ชาย ม.1";
      moved++;
    } else if (person.category === "หญิง ม.ต้น") {
      applicantUpdates[id + "/category"] = "หญิง ม.1";
      moved++;
    }
  }

  for (const [id, activity] of Object.entries(activityData)) {
    if (!activity || !Array.isArray(activity.categories) || !activity.categories.length) continue;
    const categories = activity.categories.filter(category => typeof category === "string" && category.trim());
    let changed = false;
    if (categories.includes("ชาย ม.ต้น") && !categories.includes("ชาย ม.1")) {
      categories.splice(categories.indexOf("ชาย ม.ต้น"), 0, "ชาย ม.1");
      changed = true;
    }
    if (categories.includes("หญิง ม.ต้น") && !categories.includes("หญิง ม.1")) {
      const femaleMiddleIndex = categories.indexOf("หญิง ม.ต้น");
      categories.splice(femaleMiddleIndex, 0, "หญิง ม.1");
      changed = true;
    }
    if (changed) {
      activityUpdates[id + "/categories"] = categories;
      changedActivities++;
    }
  }

  // Give the new M.1 groups the same initial quota as the former M.ต้น group.
  for (const [activityName, limitsForActivity] of Object.entries(nextCategoryLimits)) {
    if (!limitsForActivity || typeof limitsForActivity !== "object") continue;
    const updated = { ...limitsForActivity };
    if (updated["ชาย ม.ต้น"] !== undefined && updated["ชาย ม.1"] === undefined) {
      updated["ชาย ม.1"] = updated["ชาย ม.ต้น"];
    }
    if (updated["หญิง ม.ต้น"] !== undefined && updated["หญิง ม.1"] === undefined) {
      updated["หญิง ม.1"] = updated["หญิง ม.ต้น"];
    }
    nextCategoryLimits[activityName] = updated;
  }

  const writes = [
    ...(Object.keys(applicantUpdates).length ? [root.child("applicants").update(applicantUpdates)] : []),
    ...(Object.keys(activityUpdates).length ? [root.child("activities").update(activityUpdates)] : []),
    root.child("settings/categoryLimits").set(encodeFirebaseObjectKeys(nextCategoryLimits)),
    systemRef.update({
      schemaVersion: 5,
      m1CategoryMigration: {
        completedAt: firebase.database.ServerValue.TIMESTAMP,
        movedApplicants: moved,
        updatedActivities: changedActivities
      }
    })
  ];
  await Promise.all(writes);
  console.info(`PINK RUSH M.1 migration completed: ${moved} applicants moved; ${changedActivities} activities updated.`);
}

function listenToCloudData() {
  const bindList = (path, apply) => {
    const ref = db.ref(path);
    const handler = snapshot => apply(snapshot.val() || {});
    ref.on("value", handler, cloudListenerError);
    cloudUnsubscribers.push(() => ref.off("value", handler));
  };
  bindList("pinkRush/data/applicants", value => {
    applicants = Object.values(value).filter(Boolean);
    refreshAllViews();
  });
  bindList("pinkRush/data/staff", value => {
    staff = Object.values(value).filter(Boolean);
    refreshAllViews();
  });
  bindList("pinkRush/data/activities", value => {
    activities = Object.entries(value).filter(([, item]) => item && typeof item === "object").map(([id, item]) => ({
      ...item,
      id: String(item.id || id),
      categories: Array.isArray(item.categories)
        ? item.categories.filter(category => typeof category === "string" && category.trim())
        : defaultCategoriesForActivity(item),
      splitCategories: typeof item.splitCategories === "boolean"
        ? item.splitCategories && (Array.isArray(item.categories) ? item.categories.some(category => typeof category === "string" && category.trim()) : defaultCategoriesForActivity(item).length > 0)
        : (Array.isArray(item.categories) ? item.categories.some(category => typeof category === "string" && category.trim()) : defaultCategoriesForActivity(item).length > 0)
    }));
    lastKnownActivities = new Map(activities.map(item => [String(item.id), item]));
    activitiesCloudLoaded = true;
    refreshAllViews();
  });
  const settingsRef = db.ref("pinkRush/data/settings");
  const settingsHandler = snapshot => {
    const value = snapshot.val();
    if (value && value.limits && typeof value.limits === "object") {
      limits = decodeFirebaseObjectKeys(value.limits);
      categoryLimits = value.categoryLimits && typeof value.categoryLimits === "object" ? decodeFirebaseObjectKeys(value.categoryLimits) : {};
      refreshAllViews();
    }
  };
  settingsRef.on("value", settingsHandler, cloudListenerError);
  cloudUnsubscribers.push(() => settingsRef.off("value", settingsHandler));
}

function cloudListenerError(error) {
  console.error("Realtime Database listener failed:", error);
  setCloudStatus("อ่านข้อมูลออนไลน์ไม่ได้: " + (error.code || error.message || "ตรวจสอบ Rules"), "error");
}

async function startFirebaseSync() {
  try {
    const config = window.PINK_RUSH_FIREBASE_CONFIG;
    if (!config || !config.apiKey || config.apiKey === "ใส่_API_KEY") {
      setCloudStatus("กรุณาตั้งค่า Firebase ใน firebase-config.js", "error");
      return;
    }
    if (!config.databaseURL || config.databaseURL.includes("ใส่_DATABASE_URL")) {
      setCloudStatus("กรุณาใส่ databaseURL จาก Realtime Database", "error");
      return;
    }
    if (!window.firebase || !firebase.apps) throw new Error("Firebase SDK โหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต");
    if (!firebase.apps.length) firebase.initializeApp(config);
    db = firebase.database();
    setCloudStatus("กำลังเชื่อมต่อ Realtime Database...", "loading");

    const root = db.ref("pinkRush");

    // Read independent collections concurrently to shorten startup time.
    // Activities are NEVER seeded from hard-coded defaults: Firebase is authoritative.
    const [applicantsSnapshot, staffSnapshot, settingsSnapshot] = await Promise.all([
      root.child("data/applicants").once("value"),
      root.child("data/staff").once("value"),
      root.child("data/settings").once("value")
    ]);

    const initializationWrites = [];
    if (!applicantsSnapshot.exists()) initializationWrites.push(root.child("data/applicants").set({}));
    if (!staffSnapshot.exists()) initializationWrites.push(root.child("data/staff").set({}));
    if (!settingsSnapshot.exists()) initializationWrites.push(root.child("data/settings").set({ limits: {}, categoryLimits: {} }));
    if (initializationWrites.length) await Promise.all(initializationWrites);

    await root.child("system").update({
      initialized: true,
      upgradedAt: firebase.database.ServerValue.TIMESTAMP
    });

    cloudReady = true;
    await migrateM1CategoriesOnce();
    listenToCloudData();
    setCloudStatus("เชื่อมต่อ Realtime Database แล้ว • ซิงก์ข้อมูลออนไลน์", "online");
  } catch (error) {
    cloudReady = false;
    console.error("Realtime Database initialization failed:", error);
    setCloudStatus("เชื่อมต่อ Realtime Database ไม่สำเร็จ: " + (error.code || error.message), "error");
  }
}

startFirebaseSync();

let currentActivity = "";



// --------------------------------------------

// PAGE NAVIGATION

// --------------------------------------------



let adminSession = false;
try {
  adminSession = sessionStorage.getItem(SESSION_KEY) === "true";
} catch (error) {
  console.warn("Unable to restore admin session:", error);
}

function isAdmin() {
  return adminSession === true;
}



function showPage(page) {

  if (page === "admin" && !isAdmin()) {

    page = "login";

  }



  document.querySelectorAll(".page").forEach(section => {

    section.classList.add("hidden");

  });



  const target = getElement(page);



  if (target) {

    target.classList.remove("hidden");

  }



  document.querySelectorAll(".nav-btn").forEach(button => {

    button.classList.toggle(

      "active",

      button.dataset.page === page ||

      (page === "admin" && button.dataset.page === "login")

    );

  });



  if (page === "home") {

    renderHomeActivities();

    renderStaff();

  }



  if (page === "activities") {

    renderActivities();

  }



  if (page === "admin") {

    renderAdmin();

  }



  window.scrollTo({ top: 0, behavior: "smooth" });

}



document.querySelectorAll("[data-page]").forEach(button => {

  button.addEventListener("click", () => {

    const page = button.dataset.page;



    if (page === "login" && isAdmin()) {

      showPage("admin");

    } else {

      showPage(page);

    }

  });

});



document.querySelectorAll("[data-go]").forEach(button => {

  button.addEventListener("click", () => {

    showPage(button.dataset.go);

  });

});



// --------------------------------------------

// ACTIVITIES

// --------------------------------------------



function createActivityCard(activity) {

  const count = getActivityCount(activity.name);
  const categories = isActivitySplit(activity) ? activity.categories : [];
  const max = categories.length
    ? categories.reduce((sum, category) => sum + getCategoryLimit(activity.name, category), 0)
    : getLimit(activity.name);
  const allCategoriesFull = categories.length > 0 && categories.every(category =>
    getCategoryCount(activity.name, category) >= getCategoryLimit(activity.name, category)
  );
  const full = categories.length ? allCategoriesFull : count >= max;

  const capacitySummary = categories.length
    ? `<div class="activity-category-summary">${categories.map(category => {
        const categoryCount = getCategoryCount(activity.name, category);
        const categoryMax = getCategoryLimit(activity.name, category);
        return `<span>${escapeHTML(category)}: ${categoryCount}/${categoryMax} คน</span>`;
      }).join("")}</div><p class="activity-total-count">รวมสมัครแล้ว ${count}/${max} คน</p>`
    : `<p>สมัครแล้ว ${count}/${max} คน</p>`;

  return `
    <article class="activity-card ${full ? "full" : ""}"
      data-sport="${escapeHTML(activity.name)}">
      <div class="activity-icon">${escapeHTML(activity.icon || "🏅")}</div>
      <h3>${escapeHTML(activity.name)}</h3>
      <p>${escapeHTML(activity.desc)}</p>
      ${capacitySummary}
      <span class="card-link">
        ${full ? "เต็มแล้ว" : "ดูรายละเอียดและสมัคร →"}
      </span>
    </article>
  `;

}



function bindActivityCards(container) {

  container.querySelectorAll("[data-sport]").forEach(card => {

    card.addEventListener("click", () => {

      openSport(card.dataset.sport);

    });

  });

}



function renderHomeActivities() {

  const container = getElement("homeActivityGrid");

  if (!container) return;



  container.innerHTML = activities

    .slice(0, 4)

    .map(createActivityCard)

    .join("");



  bindActivityCards(container);

}



function renderActivities() {

  const container = getElement("activityGrid");

  if (!container) return;



  container.innerHTML = activities

    .map(createActivityCard)

    .join("");



  bindActivityCards(container);

}



// --------------------------------------------

// STAFF

// --------------------------------------------



function renderStaff() {

  const container = getElement("staffList");

  if (!container) return;



  container.innerHTML = activities.map(activity => {

    const people = staff.filter(person =>

      person.activity === activity.name

    );



    return `

      <article class="staff-card">

        <div class="activity-icon">${activity.icon}</div>

        <h3>${escapeHTML(activity.name)}</h3>



        ${

          people.length

            ? people.map(person => `

                <div class="staff-person">

                  <strong>${escapeHTML(person.name)}</strong>



                  ${

                    person.role

                      ? `<span class="muted small-text">${escapeHTML(person.role)}</span>`

                      : ""

                  }



                  <a href="tel:${escapeHTML(person.phone)}">

                    ☎ ${escapeHTML(person.phone)}

                  </a>

                </div>

              `).join("")

            : `<p class="staff-empty">ยังไม่มีรายชื่อสตาฟ</p>`

        }

      </article>

    `;

  }).join("");

}



// --------------------------------------------

// SPORT DETAIL

// --------------------------------------------



function openSport(name) {

  const activity = getActivity(name);

  if (!activity) return;



  currentActivity = name;



  getElement("sportIcon").textContent = activity.icon;

  getElement("sportTitle").textContent = activity.name;

  getElement("sportDescription").textContent = activity.desc;

  getElement("activityName").value = activity.name;



  getElement("registerForm").reset();

  getElement("activityName").value = activity.name;
  const categoryWrap = getElement("sportCategoryWrap");
  const categorySelect = getElement("sportCategory");
  const categories = isActivitySplit(activity) ? activity.categories : [];
  categoryWrap.classList.toggle("hidden", categories.length === 0);
  categorySelect.required = categories.length > 0;
  categorySelect.innerHTML = categories.length
    ? '<option value="">เลือกประเภทการแข่งขัน</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("")
    : '<option value="">ไม่แยกประเภท</option>';

  getElement("registerMessage").textContent = "";
  renderSportQr(activity);

  updateCapacity(name);

  showPage("sportPage");

}



getElement("backActivities").addEventListener("click", () => {

  showPage("activities");

});

getElement("sportCategory").addEventListener("change", () => { if (currentActivity) updateCapacity(currentActivity); });



// --------------------------------------------

// CAPACITY

// --------------------------------------------



function updateCapacity(name) {
  const activity = getActivity(name);
  const categories = isActivitySplit(activity) ? activity.categories : [];
  const categorySelect = getElement("sportCategory");
  const selectedCategory = categories.length ? categorySelect.value : "";
  const submit = getElement("registerForm").querySelector("button[type='submit']");

  if (categories.length) {
    const summary = categories.map(category => {
      const count = getCategoryCount(name, category);
      const max = getCategoryLimit(name, category);
      return `${category} ${count}/${max}`;
    }).join(" • ");
    if (!selectedCategory) {
      getElement("sportCapacity").textContent = `จำนวนผู้สมัคร: ${summary} • กรุณาเลือกประเภทการแข่งขัน`;
      submit.disabled = true;
      submit.textContent = "เลือกประเภทก่อนสมัคร";
      return;
    }
    const count = getCategoryCount(name, selectedCategory);
    const max = getCategoryLimit(name, selectedCategory);
    const remaining = Math.max(0, max - count);
    const full = count >= max;
    getElement("sportCapacity").textContent = `ประเภท ${selectedCategory}: สมัครแล้ว ${count}/${max} คน • เหลือ ${remaining} ที่ | ${summary}`;
    submit.disabled = full;
    submit.textContent = full ? "ประเภทนี้เต็มแล้ว" : "ส่งใบสมัคร →";
    return;
  }

  const max = getLimit(name);
  const count = getActivityCount(name);
  const remaining = Math.max(0, max - count);
  const full = count >= max;
  getElement("sportCapacity").textContent = `สมัครแล้ว ${count} / ${max} คน • เหลือ ${remaining} ที่`;
  submit.disabled = full;
  submit.textContent = full ? "กิจกรรมเต็มแล้ว" : "ส่งใบสมัคร →";
}



// --------------------------------------------

// REGISTRATION

// --------------------------------------------



getElement("registerForm").addEventListener("submit", async event => {

  event.preventDefault();



  const name = getElement("studentName").value.trim();

  const classroom = getElement("classroom").value.trim();

  const number = getElement("studentNumber").value.trim();

  const phone = getElement("phone").value.trim();

  const note = getElement("note").value.trim();
  const category = getElement("sportCategory").value;
  const selectedActivity = getActivity(currentActivity);
  const needsCategory = isActivitySplit(selectedActivity);



  if (!name || !classroom || !currentActivity || (needsCategory && !category)) {

    alert("กรุณากรอกข้อมูลให้ครบ");

    return;

  }



  const selectedLimit = needsCategory ? getCategoryLimit(currentActivity, category) : getLimit(currentActivity);
  const selectedCount = needsCategory ? getCategoryCount(currentActivity, category) : getActivityCount(currentActivity);
  if (selectedCount >= selectedLimit) {

    alert(needsCategory ? `ประเภท ${category} มีผู้สมัครครบจำนวนแล้ว` : "กิจกรรมนี้มีผู้สมัครครบจำนวนแล้ว");

    updateCapacity(currentActivity);

    return;

  }



  const duplicate = applicants.some(person =>

    person.name.toLowerCase() === name.toLowerCase() &&

    person.classroom.toLowerCase() === classroom.toLowerCase() &&

    person.activity === currentActivity &&
    (person.category || "") === (category || "")

  );



  if (duplicate) {

    alert("พบชื่อผู้สมัครนี้ในกิจกรรมนี้แล้ว");

    return;

  }



  if (!cloudReady || !db) {
    alert("ยังเชื่อมต่อฐานข้อมูลกลางไม่ได้ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง");
    return;
  }

  const applicantRef = db.ref("pinkRush/data/applicants").push();
  const applicant = {
    id: applicantRef.key,
    name,
    classroom,
    number,
    phone,
    note,
    activity: currentActivity,
    category: category || "",
    status: "รอตรวจสอบ",
    created: new Date().toISOString()
  };

  const submitButton = getElement("registerForm").querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "กำลังส่งใบสมัคร...";
  try {
    await applicantRef.set(applicant);
    // Do not append locally here: the Realtime Database onValue listener
    // is the single source of truth and will add this record to the UI.
  } catch (error) {
    console.error("Applicant submission failed:", error);
    alert("ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง (" + (error.code || error.message) + ")");
    submitButton.disabled = false;
    submitButton.textContent = "ส่งใบสมัคร →";
    updateCapacity(currentActivity);
    return;
  }

  getElement("registerForm").reset();
  submitButton.disabled = false;
  submitButton.textContent = "ส่งใบสมัคร →";

  getElement("activityName").value = currentActivity;



  getElement("registerMessage").textContent =

    "ส่งใบสมัครเรียบร้อยแล้ว! กรุณารอตรวจสอบสถานะ";



  updateCapacity(currentActivity);

  renderActivities();

  renderHomeActivities();

});



// --------------------------------------------

// ADMIN LOGIN

// --------------------------------------------



getElement("loginForm").addEventListener("submit", event => {

  event.preventDefault();



  const username = getElement("username").value.trim();

  const password = getElement("password").value;

  const error = getElement("loginError");



  if (username === "Pink" && password === "6265") {

    adminSession = true;
    try { sessionStorage.setItem(SESSION_KEY, "true"); }
    catch (storageError) { console.warn("Unable to persist admin session:", storageError); }


    getElement("loginForm").reset();

    error.textContent = "";



    showPage("admin");

  } else {

    error.textContent = "Username หรือ Password ไม่ถูกต้อง";

  }

});



// --------------------------------------------

// LOGOUT

// --------------------------------------------



getElement("logoutBtn").addEventListener("click", () => {

  if (!confirm("ต้องการออกจากระบบหรือไม่?")) return;



  adminSession = false;
  try { sessionStorage.removeItem(SESSION_KEY); }
  catch (storageError) { console.warn("Unable to clear admin session:", storageError); }

  showPage("home");

});



// --------------------------------------------

// ADMIN TABS

// --------------------------------------------



const adminPanels = ["applicants", "activities", "limits", "staff", "backup"];



document.querySelectorAll("[data-admin]").forEach(button => {

  button.addEventListener("click", () => {

    if (!isAdmin()) {

      showPage("login");

      return;

    }



    document.querySelectorAll("[data-admin]").forEach(item => {

      item.classList.toggle("active", item === button);

    });



    adminPanels.forEach(name => {

      const panel = getElement(name + "Panel");



      if (panel) {

        panel.classList.toggle("hidden", name !== button.dataset.admin);

      }

    });



    if (button.dataset.admin === "activities") renderActivityAdmin();

    if (button.dataset.admin === "staff") renderStaffAdmin();

    if (button.dataset.admin === "limits") renderLimits();

  });

});



// --------------------------------------------

// ADMIN DASHBOARD

// --------------------------------------------



function renderCategoryFilter() {
  const select = getElement("categoryFilter");
  if (!select) return;

  const activityName = getElement("activityFilter").value;
  const selectedActivity = activities.find(item => item.name === activityName);
  const sourceActivities = selectedActivity ? [selectedActivity] : activities;
  const categories = [...new Set(sourceActivities.flatMap(item =>
    isActivitySplit(item) ? item.categories : []
  ))];

  const previousValue = select.value;
  select.innerHTML = '<option value="">ทุกระดับ / ทุกเพศ</option>' +
    categories.map(category =>
      `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
    ).join("");
  select.disabled = categories.length === 0;
  select.value = categories.includes(previousValue) ? previousValue : "";
}


function renderAdmin() {

  if (!isAdmin()) {

    showPage("login");

    return;

  }



  getElement("totalCount").textContent = applicants.length;



  getElement("pendingCount").textContent =

    applicants.filter(a => a.status === "รอตรวจสอบ").length;



  getElement("passCount").textContent =

    applicants.filter(a => a.status === "ผ่าน").length;



  getElement("failCount").textContent =

    applicants.filter(a => a.status === "ไม่ผ่าน").length;



  const filter = getElement("activityFilter");

  const oldValue = filter.value;



  filter.innerHTML =

    '<option value="">ทุกกิจกรรม</option>' +

    activities.map(activity => `

      <option value="${escapeHTML(activity.name)}">

        ${escapeHTML(activity.name)}

      </option>

    `).join("");



  filter.value = oldValue;
  renderCategoryFilter();



  renderTable();

  renderLimits();

  renderStaffAdmin();

}



// --------------------------------------------

// FILTERS

// --------------------------------------------



getElement("searchInput").addEventListener("input", renderTable);

getElement("activityFilter").addEventListener("change", () => {
  renderCategoryFilter();
  renderTable();
});
getElement("categoryFilter").addEventListener("change", renderTable);



getElement("statusFilter").addEventListener("change", () => {

  const status = getElement("statusFilter").value;



  document.querySelectorAll("[data-status]").forEach(button => {

    button.classList.toggle("active", button.dataset.status === status);

  });



  renderTable();

});



document.querySelectorAll("[data-status]").forEach(button => {

  button.addEventListener("click", () => {

    const status = button.dataset.status;



    getElement("statusFilter").value = status;



    document.querySelectorAll("[data-status]").forEach(item => {

      item.classList.toggle("active", item === button);

    });



    renderTable();

  });

});



// --------------------------------------------

// FILTERED APPLICANTS

// --------------------------------------------



// --------------------------------------------
// SORT BY LEVEL / ROOM  (ม.4 -> ม.5 -> ม.6, 6/1 -> 6/2 -> 6/3)
// --------------------------------------------

let sortByClassroom = false;

function parseClassroom(value) {
  const text = String(value || "")
    .replace(/[๐-๙]/g, digit => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)))
    .trim();
  const nums = text.match(/\d+/g) || [];
  return {
    level: nums.length ? parseInt(nums[0], 10) : Infinity,
    room: nums.length > 1 ? parseInt(nums[1], 10) : Infinity
  };
}

function compareApplicantsByClassroom(a, b) {
  const ca = parseClassroom(a.classroom);
  const cb = parseClassroom(b.classroom);
  if (ca.level !== cb.level) return ca.level < cb.level ? -1 : 1;
  if (ca.room !== cb.room) return ca.room < cb.room ? -1 : 1;

  const na = parseInt(String(a.number || "").replace(/\D/g, ""), 10);
  const nb = parseInt(String(b.number || "").replace(/\D/g, ""), 10);
  const hasA = Number.isFinite(na);
  const hasB = Number.isFinite(nb);
  if (hasA && hasB && na !== nb) return na - nb;
  if (hasA !== hasB) return hasA ? -1 : 1;

  return String(a.name || "").localeCompare(String(b.name || ""), "th");
}

function sortApplicantsIfNeeded(list) {
  return sortByClassroom ? [...list].sort(compareApplicantsByClassroom) : list;
}

function updateSortButton() {
  const button = document.getElementById("sortClassBtn");
  if (!button) return;
  button.classList.toggle("active", sortByClassroom);
  button.setAttribute("aria-pressed", sortByClassroom ? "true" : "false");
  button.textContent = sortByClassroom
    ? "✓ จัดเรียงแล้ว: ชั้น → ห้อง → เลขที่ (กดเพื่อยกเลิก)"
    : "🗂 จัดข้อมูล: เรียงตามชั้น/ห้อง";
}

document.getElementById("sortClassBtn")?.addEventListener("click", () => {
  sortByClassroom = !sortByClassroom;
  updateSortButton();
  renderTable();
});

function getFilteredApplicants() {

  const search = getElement("searchInput").value.trim().toLowerCase();

  const activity = getElement("activityFilter").value;

  const status = getElement("statusFilter").value;
  const category = getElement("categoryFilter").value;



  const result = applicants.filter(person => {

    const searchText = [

      person.name,

      person.classroom,

      person.number,

      person.activity,

      person.phone

    ].join(" ").toLowerCase();



    return searchText.includes(search) &&

      (!activity || person.activity === activity) &&

      (!category || person.category === category) &&

      (!status || person.status === status);

  });

  return sortApplicantsIfNeeded(result);

}



// --------------------------------------------

// APPLICANT TABLE

// --------------------------------------------



function renderTable() {

  const activity = getElement("activityFilter").value;

  const status = getElement("statusFilter").value;
  const category = getElement("categoryFilter").value;

  const search = getElement("searchInput").value.trim();



  const filtered = getFilteredApplicants();



  getElement("printActivityTitle").textContent =

    activity || "ทุกกิจกรรม";



  let statusText = status

    ? `รายชื่อผู้สมัครสถานะ: ${status}`

    : "รายชื่อผู้สมัครทั้งหมด";



  if (category) statusText += ` | ${category}`;
  if (sortByClassroom) statusText += " | เรียงตามชั้น/ห้อง";
  if (search) statusText += ` | คำค้นหา: ${search}`;



  getElement("printStatusTitle").textContent = statusText;

  getElement("printCount").textContent =

    `จำนวนผู้สมัคร ${filtered.length} คน`;



  const tbody = getElement("applicantTable");



  if (!filtered.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="5">ไม่พบรายชื่อผู้สมัคร</td>

      </tr>

    `;

    return;

  }



  tbody.innerHTML = filtered.map(person => {

    const statusClass =

      person.status === "ผ่าน" ? "pass" :

      person.status === "ไม่ผ่าน" ? "fail" : "pending";



    return `

      <tr>

        <td>

          <strong>${escapeHTML(person.name)}</strong>

          <br>

          <small>${escapeHTML(person.classroom)}</small>

        </td>



        <td>${escapeHTML(person.activity)}${person.category ? `<br><small>${escapeHTML(person.category)}</small>` : ""}</td>



        <td>

          <span class="status ${statusClass}">

            ${escapeHTML(person.status)}

          </span>

        </td>



        <td class="print-phone-cell">

          <span class="phone-writing-box"></span>

        </td>



        <td class="screen-actions">

          <button class="action-btn action-pending"

            data-action="รอตรวจสอบ"

            data-id="${escapeHTML(person.id)}">รอตรวจสอบ</button>



          <button class="action-btn action-pass"

            data-action="ผ่าน"

            data-id="${escapeHTML(person.id)}">ผ่าน</button>



          <button class="action-btn action-fail"

            data-action="ไม่ผ่าน"

            data-id="${escapeHTML(person.id)}">ไม่ผ่าน</button>



          <button class="action-btn action-edit"

            data-action="edit"

            data-id="${escapeHTML(person.id)}">แก้ไข</button>



          <button class="action-btn action-delete"

            data-action="delete"

            data-id="${escapeHTML(person.id)}">ลบ</button>

        </td>

      </tr>

    `;

  }).join("");



  tbody.querySelectorAll("[data-action]").forEach(button => {

    button.addEventListener("click", () => {

      manageApplicant(button.dataset.id, button.dataset.action);

    });

  });

}



// --------------------------------------------

// MANAGE APPLICANTS

// --------------------------------------------



function manageApplicant(id, action) {

  const person = applicants.find(item => item.id === id);

  if (!person) return;



  if (action === "ผ่าน" || action === "ไม่ผ่าน" || action === "รอตรวจสอบ") {

    person.status = action;

  }



  if (action === "delete") {

    if (!confirm(`ยืนยันลบรายชื่อ ${person.name} หรือไม่?`)) return;



    applicants = applicants.filter(item => item.id !== id);

  }



  if (action === "edit") {

    const name = prompt("แก้ไขชื่อ - นามสกุล", person.name);

    if (name === null) return;



    const classroom = prompt("แก้ไขชั้น / ห้อง", person.classroom);

    if (classroom === null) return;



    const number = prompt("แก้ไขเลขที่", person.number || "");

    if (number === null) return;



    const phone = prompt("แก้ไขเบอร์โทรศัพท์", person.phone || "");

    if (phone === null) return;



    if (!name.trim() || !classroom.trim()) {

      alert("กรุณากรอกชื่อและชั้น / ห้อง");

      return;

    }



    person.name = name.trim();

    person.classroom = classroom.trim();

    person.number = number.trim();

    person.phone = phone.trim();

  }



  saveData();

  renderAdmin();

  renderActivities();

  renderHomeActivities();



  if (currentActivity) updateCapacity(currentActivity);

}



// --------------------------------------------
// ACTIVITY / SPORT MANAGEMENT
// --------------------------------------------

function renderActivityAdmin() {
  const tbody = getElement("activityAdminTable");
  if (!tbody) return;
  tbody.innerHTML = activities.map((activity, index) => `
    <tr>
      <td>${escapeHTML(activity.icon)}</td>
      <td><strong>${escapeHTML(activity.name)}</strong></td>
      <td>${escapeHTML(activity.desc || "-")}</td>
      <td>${getActivityCount(activity.name)} คน</td>
      <td class="qr-admin-cell">
        ${activity.qrImage ? `<img class="qr-admin-preview" src="${escapeHTML(activity.qrImage)}" alt="QR Code ${escapeHTML(activity.name)}">` : '<small>ยังไม่มี QR Code</small>'}
        <label class="btn-soft qr-upload-label">${activity.qrImage ? "เปลี่ยนรูป QR" : "+ อัปโหลด QR"}
          <input class="qr-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-qr-upload="${index}" aria-label="อัปโหลด QR Code ของ ${escapeHTML(activity.name)}">
        </label>
        ${activity.qrImage ? `<button type="button" class="btn-danger" data-qr-remove="${index}">ลบ QR</button>` : ""}
      </td>
      <td>
        <strong class="category-mode-label">${isActivitySplit(activity) ? "แยกประเภท" : "ไม่แยกประเภท"}</strong>
        ${isActivitySplit(activity) ? `<div class="category-admin-list">${(activity.categories || []).map((category, categoryIndex) => `
          <div class="row-actions category-admin-row">
            <span>${escapeHTML(category)}</span>
            <button type="button" class="btn-soft" data-category-edit="${index}" data-category-index="${categoryIndex}">แก้ประเภท</button>
            <button type="button" class="btn-danger" data-category-delete="${index}" data-category-index="${categoryIndex}">ลบ</button>
          </div>`).join("")}</div>
        <button type="button" class="btn-soft" data-category-add="${index}">+ เพิ่มประเภท</button>` : `<small>การสมัครจะนับรวมทั้งหมด</small>`}
        <div class="row-actions" style="margin-top:8px">
          <button type="button" class="btn-soft" data-activity-edit="${index}">แก้ไขกีฬา</button>
          <button type="button" class="btn-danger" data-activity-delete="${index}">ลบกีฬา</button>
        </div>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="6">ยังไม่มีรายการกีฬา</td></tr>';

  tbody.querySelectorAll("[data-activity-edit]").forEach(button => {
    button.addEventListener("click", () => editActivity(Number(button.dataset.activityEdit)));
  });
  tbody.querySelectorAll("[data-activity-delete]").forEach(button => {
    button.addEventListener("click", () => deleteActivity(Number(button.dataset.activityDelete)));
  });
  tbody.querySelectorAll("[data-category-add]").forEach(button => button.addEventListener("click", () => addActivityCategory(Number(button.dataset.categoryAdd))));
  tbody.querySelectorAll("[data-category-edit]").forEach(button => button.addEventListener("click", () => editActivityCategory(Number(button.dataset.categoryEdit), Number(button.dataset.categoryIndex))));
  tbody.querySelectorAll("[data-category-delete]").forEach(button => button.addEventListener("click", () => deleteActivityCategory(Number(button.dataset.categoryDelete), Number(button.dataset.categoryIndex))));
  tbody.querySelectorAll("[data-qr-upload]").forEach(input => {
    input.addEventListener("change", async event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const index = Number(event.target.dataset.qrUpload);
      const activityName = activities[index]?.name || "กิจกรรมนี้";
      try {
        const dataUrl = await fileToQrDataUrl(file);
        saveActivityQr(index, dataUrl);
        alert(`บันทึก QR Code ของ ${activityName} เรียบร้อยแล้ว`);
      } catch (error) {
        alert(error.message || "อัปโหลด QR Code ไม่สำเร็จ");
      } finally {
        event.target.value = "";
      }
    });
  });
  tbody.querySelectorAll("[data-qr-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.qrRemove);
      const activity = activities[index];
      if (!activity || !confirm(`ต้องการลบ QR Code ของ ${activity.name} ใช่ไหม?`)) return;
      delete activity.qrImage;
      try { saveActivities(); } catch (error) { alert("บันทึกการลบไม่สำเร็จ: " + error.message); return; }
      renderActivityAdmin();
      if (currentActivity === activity.name) renderSportQr(activity);
    });
  });
}

function saveCategoryChanges(activity) {
  saveActivities();
  renderActivityAdmin();
  renderActivities();
  renderHomeActivities();
}

function addActivityCategory(activityIndex) {
  const activity = activities[activityIndex];
  if (!activity) return;
  const name = prompt(`เพิ่มประเภทการแข่งขันของ ${activity.name}`);
  if (name === null) return;
  const category = name.trim();
  if (!category) return alert("กรุณากรอกชื่อประเภท");
  activity.categories = Array.isArray(activity.categories) ? activity.categories : [];
  if (activity.categories.some(item => item.toLowerCase() === category.toLowerCase())) return alert("มีประเภทนี้แล้ว");
  activity.categories.push(category);
  activity.splitCategories = true;
  saveCategoryChanges(activity);
}

function editActivityCategory(activityIndex, categoryIndex) {
  const activity = activities[activityIndex];
  const oldName = activity?.categories?.[categoryIndex];
  if (!activity || !oldName) return;
  const value = prompt("แก้ไขชื่อประเภท", oldName);
  if (value === null) return;
  const category = value.trim();
  if (!category) return alert("ชื่อประเภทห้ามว่าง");
  if (activity.categories.some((item, index) => index !== categoryIndex && item.toLowerCase() === category.toLowerCase())) return alert("มีประเภทนี้แล้ว");
  activity.categories[categoryIndex] = category;
  saveCategoryChanges(activity);
}

function deleteActivityCategory(activityIndex, categoryIndex) {
  const activity = activities[activityIndex];
  const category = activity?.categories?.[categoryIndex];
  if (!activity || !category) return;
  if (!confirm(`ลบประเภท ${category} ของกีฬา ${activity.name} ใช่ไหม?`)) return;
  activity.categories.splice(categoryIndex, 1);
  saveCategoryChanges(activity);
}

function resetActivityForm() {
  const form = getElement("activityForm");
  if (!form) return;
  form.reset();
  getElement("activityId").value = "";
  getElement("activityIconAdmin").value = "🏅";
  getElement("activitySplitCategories").checked = false;
  getElement("activitySubmit").textContent = "+ เพิ่มกีฬา";
  getElement("cancelActivityEdit").classList.add("hidden");
}

function editActivity(index) {
  const activity = activities[index];
  if (!activity) return;
  getElement("activityId").value = String(index);
  getElement("activityNameAdmin").value = activity.name;
  getElement("activityIconAdmin").value = activity.icon;
  getElement("activityDescAdmin").value = activity.desc;
  getElement("activitySplitCategories").checked = isActivitySplit(activity);
  getElement("activitySubmit").textContent = "บันทึกการแก้ไข";
  getElement("cancelActivityEdit").classList.remove("hidden");
  getElement("activityForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteActivity(index) {
  const activity = activities[index];
  if (!activity) return;
  const count = getActivityCount(activity.name);
  const staffCount = staff.filter(person => person.activity === activity.name).length;
  const message = count || staffCount
    ? `กีฬา ${activity.name} มีผู้สมัคร ${count} คน และสตาฟ ${staffCount} คน การลบจะลบข้อมูลที่ผูกกับกีฬานี้ด้วย ต้องการดำเนินการหรือไม่?`
    : `ต้องการลบกีฬา ${activity.name} หรือไม่?`;
  if (!confirm(message)) return;

  activities.splice(index, 1);
  applicants = applicants.filter(person => person.activity !== activity.name);
  staff = staff.filter(person => person.activity !== activity.name);
  delete limits[activity.name];
  delete categoryLimits[activity.name];
  saveActivities();
  saveData();
  saveStaff();
  resetActivityForm();
  renderActivityAdmin();
  renderAdmin();
  renderActivities();
  renderHomeActivities();
  renderStaff();
  renderStaffAdmin();
  renderLimits();
  alert("ลบกีฬาเรียบร้อยแล้ว");
}

getElement("activityForm").addEventListener("submit", event => {
  event.preventDefault();
  const oldIndex = getElement("activityId").value;
  const name = getElement("activityNameAdmin").value.trim();
  const icon = getElement("activityIconAdmin").value.trim() || "🏅";
  const desc = getElement("activityDescAdmin").value.trim();
  const splitCategories = getElement("activitySplitCategories").checked;
  if (!name) return;

  const existing = activities.findIndex((item, index) =>
    item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && String(index) !== oldIndex
  );
  if (existing !== -1) {
    alert("มีชื่อกีฬานี้อยู่แล้ว");
    return;
  }

  if (oldIndex !== "") {
    const index = Number(oldIndex);
    const previousName = activities[index]?.name;
    if (!activities[index]) return;
    const previousCategories = Array.isArray(activities[index].categories) ? [...activities[index].categories] : [];
    activities[index] = {
      ...activities[index], name, icon, desc,
      splitCategories,
      // A non-split activity must not retain stale category definitions.
      // If split mode is enabled again, restore its previous categories or defaults.
      categories: splitCategories
        ? (previousCategories.length ? previousCategories : [...SPORT_CATEGORIES])
        : []
    };
    if (previousName !== name) {
      applicants.forEach(person => { if (person.activity === previousName) person.activity = name; });
      staff.forEach(person => { if (person.activity === previousName) person.activity = name; });
      if (Object.prototype.hasOwnProperty.call(limits, previousName)) {
        limits[name] = limits[previousName];
        delete limits[previousName];
      }
      if (Object.prototype.hasOwnProperty.call(categoryLimits, previousName)) {
        categoryLimits[name] = categoryLimits[previousName];
        delete categoryLimits[previousName];
      }
      saveData();
      saveStaff();
    }
  } else {
    activities.push({ id: makeId(), name, icon, desc, splitCategories, categories: splitCategories ? [...SPORT_CATEGORIES] : [] });
  }

  saveActivities();
  resetActivityForm();
  renderActivityAdmin();
  renderActivities();
  renderHomeActivities();
  renderAdmin();
  renderStaff();
  renderStaffAdmin();
  renderLimits();
  alert(oldIndex !== "" ? "แก้ไขกีฬาเรียบร้อยแล้ว" : "เพิ่มกีฬาเรียบร้อยแล้ว");
});

getElement("cancelActivityEdit").addEventListener("click", resetActivityForm);

// --------------------------------------------

// ACTIVITY LIMITS

// --------------------------------------------



function renderLimits() {
  const container = getElement("limitList");
  if (!container) return;
  container.innerHTML = activities.map(activity => {
    const categories = isActivitySplit(activity) ? activity.categories : [];
    if (categories.length) {
      const rows = categories.map(category => {
        const count = getCategoryCount(activity.name, category);
        const max = getCategoryLimit(activity.name, category);
        return `<label class="category-limit-row"><span>${escapeHTML(category)} <small>สมัครแล้ว ${count} คน</small></span><input type="number" min="${count}" step="1" value="${max}" data-category-limit-activity="${escapeHTML(activity.name)}" data-category-limit-name="${escapeHTML(category)}" aria-label="จำนวนรับ ${escapeHTML(category)} ของ ${escapeHTML(activity.name)}"></label>`;
      }).join("");
      return `<section class="limit-sport-card"><div class="limit-sport-heading"><strong>${escapeHTML(activity.icon)} ${escapeHTML(activity.name)}</strong><small>กำหนดจำนวนรับแยกตามเพศและระดับชั้น</small></div><div class="category-limit-grid">${rows}</div></section>`;
    }
    const count = getActivityCount(activity.name);
    const max = getLimit(activity.name);
    return `<div class="limit-row"><div><strong>${escapeHTML(activity.icon)} ${escapeHTML(activity.name)}</strong><small>สมัครแล้ว ${count} คน</small></div><input type="number" min="${count}" step="1" value="${max}" data-limit="${escapeHTML(activity.name)}" aria-label="จำนวนรับ ${escapeHTML(activity.name)}"></div>`;
  }).join("");
}


getElement("saveLimits").addEventListener("click", () => {
  let valid = true;
  const newLimits = { ...limits };
  const newCategoryLimits = { ...categoryLimits };

  document.querySelectorAll("[data-limit]").forEach(input => {
    const name = input.dataset.limit;
    const count = getActivityCount(name);
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < count || value < 0) {
      valid = false; input.value = count; return;
    }
    newLimits[name] = value;
  });

  document.querySelectorAll("[data-category-limit-activity]").forEach(input => {
    const activityName = input.dataset.categoryLimitActivity;
    const category = input.dataset.categoryLimitName;
    const count = getCategoryCount(activityName, category);
    const value = Number(input.value);
    if (!Number.isInteger(value) || value < count || value < 0) {
      valid = false; input.value = count; return;
    }
    newCategoryLimits[activityName] = { ...(newCategoryLimits[activityName] || {}), [category]: value };
  });

  if (!valid) {
    alert("จำนวนรับต้องเป็นจำนวนเต็ม และต้องไม่น้อยกว่าจำนวนผู้สมัครในประเภทนั้น");
    return;
  }

  limits = newLimits;
  categoryLimits = newCategoryLimits;
  saveData();
  renderAdmin();
  renderActivities();
  renderHomeActivities();
  if (currentActivity) updateCapacity(currentActivity);
  renderLimits();
  alert("บันทึกจำนวนรับแยกประเภทเรียบร้อยแล้ว");
});


// STAFF ADMIN

// --------------------------------------------



function renderStaffAdmin() {

  const tbody = getElement("staffAdminTable");

  const select = getElement("staffActivity");



  if (!tbody || !select) return;



  const previousValue = select.value;



  select.innerHTML = activities.map(activity => `

    <option value="${escapeHTML(activity.name)}">

      ${activity.icon} ${escapeHTML(activity.name)}

    </option>

  `).join("");



  if (activities.some(a => a.name === previousValue)) {

    select.value = previousValue;

  }



  if (!staff.length) {

    tbody.innerHTML = `

      <tr>

        <td colspan="4">ยังไม่มีรายชื่อสตาฟ</td>

      </tr>

    `;

    return;

  }



  tbody.innerHTML = staff.map(person => `

    <tr>

      <td>${escapeHTML(person.activity)}</td>

      <td><strong>${escapeHTML(person.name)}</strong></td>

      <td>${escapeHTML(person.phone)}</td>

      <td>

        <button class="action-btn action-edit"

          data-staff-action="edit"

          data-id="${escapeHTML(person.id)}">แก้ไข</button>



        <button class="action-btn action-delete"

          data-staff-action="delete"

          data-id="${escapeHTML(person.id)}">ลบ</button>

      </td>

    </tr>

  `).join("");



  tbody.querySelectorAll("[data-staff-action]").forEach(button => {

    button.addEventListener("click", () => {

      manageStaff(button.dataset.id, button.dataset.staffAction);

    });

  });

}



function manageStaff(id, action) {

  const person = staff.find(item => item.id === id);

  if (!person) return;



  if (action === "delete") {

    if (!confirm(`ต้องการลบรายชื่อ ${person.name} หรือไม่?`)) return;



    staff = staff.filter(item => item.id !== id);



    saveStaff();

    renderStaff();

    renderStaffAdmin();

    return;

  }



  if (action === "edit") {

    getElement("staffId").value = person.id;

    getElement("staffActivity").value = person.activity;

    getElement("staffName").value = person.name;

    getElement("staffPhone").value = person.phone;



    getElement("staffSubmit").textContent = "บันทึกการแก้ไข";

    getElement("cancelStaffEdit").classList.remove("hidden");



    getElement("staffForm").scrollIntoView({

      behavior: "smooth",

      block: "center"

    });

  }

}



getElement("staffForm").addEventListener("submit", event => {

  event.preventDefault();



  const id = getElement("staffId").value;

  const activity = getElement("staffActivity").value;

  const name = getElement("staffName").value.trim();

  const phone = getElement("staffPhone").value.trim();



  if (!activity || !name || !phone) {

    alert("กรุณากรอกข้อมูลให้ครบ");

    return;

  }



  if (!/^[0-9+\\-\s()]{8,20}$/.test(phone)) {

    alert("กรุณาตรวจสอบเบอร์โทรศัพท์");

    return;

  }



  if (id) {

    const person = staff.find(item => item.id === id);



    if (person) {

      person.activity = activity;

      person.name = name;

      person.phone = phone;

    }

  } else {

    staff.push({

      id: makeId(),

      activity,

      name,

      phone

    });

  }



  saveStaff();

  resetStaffForm();

  renderStaff();

  renderStaffAdmin();



  alert("บันทึกข้อมูลสตาฟเรียบร้อยแล้ว");

});



function resetStaffForm() {

  getElement("staffForm").reset();

  getElement("staffId").value = "";

  getElement("staffSubmit").textContent = "+ เพิ่มรายชื่อสตาฟ";

  getElement("cancelStaffEdit").classList.add("hidden");

}



getElement("cancelStaffEdit").addEventListener("click", resetStaffForm);



// --------------------------------------------

// EXPORT CSV

// --------------------------------------------



getElement("exportBtn").addEventListener("click", () => {

  const activity = getElement("activityFilter").value;

  const status = getElement("statusFilter").value;



  const filtered = sortApplicantsIfNeeded(applicants.filter(person =>

    (!activity || person.activity === activity) &&

    (!status || person.status === status)

  ));



  const rows = [

    ["ชื่อ", "ชั้น/ห้อง", "เลขที่", "เบอร์โทร", "กีฬา", "ประเภท", "สถานะ", "หมายเหตุ"]

  ];



  filtered.forEach(person => {

    rows.push([

      person.name,

      person.classroom,

      person.number,

      person.phone,

      person.activity,

      person.category || "",

      person.status,

      person.note

    ]);

  });



  const csv = "\uFEFF" + rows.map(row =>

    row.map(value =>

      '"' + String(value ?? "").replace(/"/g, '""') + '"'

    ).join(",")

  ).join("\r\n");



  downloadFile(

    csv,

    "pink-rush-applicants.csv",

    "text/csv;charset=utf-8"

  );

});



// --------------------------------------------

// DOWNLOAD PDF

// --------------------------------------------



/* ============================================
   PINK RUSH - DIRECT PDF EXPORT
   ใช้ jsPDF + AutoTable แทน html2pdf
============================================ */
(function () {
  "use strict";

  const button = document.getElementById("printBtn");
  if (!button) return;

  const PINK = [255, 76, 154];
  const DARK_PINK = [197, 45, 112];
  const PALE_PINK = [255, 240, 246];
  const TEXT = [36, 27, 43];

  function safeName(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "ALL";
  }

  function makeTextImage(text, widthMm, heightMm, options) {
    const opts = options || {};
    const ratio = 4.5;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(24, Math.ceil(widthMm * ratio));
    canvas.height = Math.max(20, Math.ceil(heightMm * ratio));
    const ctx = canvas.getContext("2d");
    const fontSize = (opts.fontSize || 9) * 96 / 72 * ratio / 3.78;
    const padding = opts.padding === undefined ? 1.2 : opts.padding;
    const maxWidth = canvas.width - padding * ratio * 2;
    const lineHeight = fontSize * (opts.lineHeight || 1.28);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = opts.color || "#241b2b";
    ctx.textBaseline = "middle";
    ctx.textAlign = opts.align || "left";
    ctx.font = `${opts.weight || 400} ${fontSize}px Kanit, sans-serif`;

    const lines = [];
    String(text ?? "").split("\n").forEach(sourceLine => {
      if (!sourceLine) { lines.push(""); return; }
      let current = "";
      for (const char of Array.from(sourceLine)) {
        const candidate = current + char;
        if (current && ctx.measureText(candidate).width > maxWidth) {
          lines.push(current);
          current = char;
        } else current = candidate;
      }
      if (current) lines.push(current);
    });

    const maxLines = Math.max(1, Math.floor((canvas.height - padding * ratio * 2) / lineHeight));
    const visible = lines.slice(0, maxLines);
    const totalHeight = visible.length * lineHeight;
    let y = (canvas.height - totalHeight) / 2 + lineHeight / 2;
    const align = opts.align || "left";
    const x = align === "center" ? canvas.width / 2 : align === "right"
      ? canvas.width - padding * ratio : padding * ratio;
    visible.forEach(line => { ctx.fillText(line, x, y, maxWidth); y += lineHeight; });
    return canvas.toDataURL("image/png");
  }

  function addThaiText(doc, text, x, y, width, height, options) {
    const opts = options || {};
    const inset = opts.inset === undefined ? 1.4 : opts.inset;
    const image = makeTextImage(text, Math.max(2, width - inset * 2), Math.max(2, height - inset * 2), opts);
    doc.addImage(image, "PNG", x + inset, y + inset, width - inset * 2, height - inset * 2);
  }

  function addHeader(doc, title, statusText, searchText, count) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const width = pageWidth - margin * 2;
    doc.setFillColor(...PINK);
    doc.roundedRect(margin, 10, width, 25, 2.5, 2.5, "F");
    addThaiText(doc, "PINK Diwaa", margin + 4, 11, width * .42, 10,
      { fontSize: 19, weight: 700, color: "#ffffff", inset: 0 });
    addThaiText(doc, "SPORTS DAY", margin + 4, 21, width * .42, 7,
      { fontSize: 8, weight: 500, color: "#ffffff", inset: 0 });
    addThaiText(doc, title, margin + width * .43, 12, width * .54, 9,
      { fontSize: 13, weight: 600, color: "#ffffff", align: "right", inset: 0 });
    addThaiText(doc, statusText, margin + width * .43, 21, width * .54, 6,
      { fontSize: 8, color: "#ffffff", align: "right", inset: 0 });
    doc.setFillColor(...PALE_PINK);
    doc.setDrawColor(255, 193, 220);
    doc.roundedRect(margin, 38, width, 9, 1.5, 1.5, "FD");
    addThaiText(doc, `จำนวนผู้สมัคร ${count} คน${searchText ? `  |  คำค้นหา: ${searchText}` : ""}`,
      margin + 2, 38.5, width - 4, 8,
      { fontSize: 8.5, weight: 500, color: "#c52d70", inset: .5 });
  }

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => { script.remove(); reject(new Error("โหลดไม่สำเร็จ: " + url)); };
      document.head.appendChild(script);
    });
  }

  async function loadLibrary(globalCheck, urls, libraryName) {
    if (globalCheck()) return true;
    for (const url of urls) {
      try {
        await loadExternalScript(url);
        if (globalCheck()) return true;
      } catch (error) {
        console.warn("โหลด " + libraryName + " ไม่สำเร็จ:", url);
      }
    }
    return false;
  }

  async function ensurePDFLibraries() {
    const jsPdfLoaded = await loadLibrary(
      () => !!(window.jspdf && window.jspdf.jsPDF),
      [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
        "https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js"
      ],
      "jsPDF"
    );
    if (!jsPdfLoaded) throw new Error("โหลด jsPDF ไม่สำเร็จ: ตรวจสอบอินเทอร์เน็ตหรือการบล็อก CDN");

    const autoTableLoaded = await loadLibrary(
      () => !!(window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === "function"),
      [
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js",
        "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js",
        "https://unpkg.com/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js"
      ],
      "AutoTable"
    );
    if (!autoTableLoaded) throw new Error("โหลดปลั๊กอิน AutoTable ไม่สำเร็จ: ตรวจสอบอินเทอร์เน็ตหรือการบล็อก CDN");
  }

  async function generatePDF() {
    if (!isAdmin()) { showPage("login"); return; }
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "กำลังเตรียมระบบ PDF...";
    try {
      await ensurePDFLibraries();
    } catch (error) {
      console.error(error);
      alert(error.message + "\n\nหากยังไม่ได้ ให้ลองเปิดผ่าน Chrome/Edge และตรวจสอบว่าเครือข่ายไม่ได้บล็อก cdnjs, jsDelivr หรือ unpkg");
      button.disabled = false;
      button.textContent = originalText;
      return;
    }
    if (typeof getFilteredApplicants !== "function" || typeof isAdmin !== "function") {
      alert("ไม่พบข้อมูล Admin กรุณาตรวจสอบ script.js");
      button.disabled = false;
      button.textContent = originalText;
      return;
    }
    const filtered = getFilteredApplicants();
    if (!filtered.length) {
      alert("ไม่มีรายชื่อผู้สมัครตามตัวกรองที่เลือก");
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    const orientation = document.getElementById("paperOrientation")?.value === "landscape" ? "landscape" : "portrait";
    const activity = document.getElementById("activityFilter")?.value || "";
    const status = document.getElementById("statusFilter")?.value || "";
    const category = document.getElementById("categoryFilter")?.value || "";
    const search = document.getElementById("searchInput")?.value.trim() || "";
    button.textContent = "กำลังสร้าง PDF...";

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
        await document.fonts.load("400 14px Kanit");
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      const availableWidth = pageWidth - margin * 2;
      const widths = orientation === "landscape"
        ? [availableWidth * .32, availableWidth * .27, availableWidth * .16, availableWidth * .25]
        : [availableWidth * .31, availableWidth * .27, availableWidth * .17, availableWidth * .25];
      addHeader(doc, activity || "ทุกกิจกรรม", [status ? `สถานะ: ${status}` : "รายชื่อผู้สมัครทั้งหมด", category, sortByClassroom ? "เรียงตามชั้น/ห้อง" : ""].filter(Boolean).join(" | "), search, filtered.length);
      const headLabels = ["ชื่อ - นามสกุล / ชั้น", "กิจกรรม", "สถานะ", "เบอร์โทรศัพท์"];

      doc.autoTable({
        startY: 51,
        margin: { top: 10, right: margin, bottom: 18, left: margin },
        head: [["", "", "", ""]],
        body: filtered.map(() => ["", "", "", ""]),
        theme: "grid",
        tableWidth: availableWidth,
        columnStyles: {
          0: { cellWidth: widths[0] }, 1: { cellWidth: widths[1] },
          2: { cellWidth: widths[2] }, 3: { cellWidth: widths[3] }
        },
        styles: {
          minCellHeight: 15,
          cellPadding: { top: 2.2, right: 1.5, bottom: 2.2, left: 1.5 },
          lineColor: [243, 165, 199], lineWidth: .2,
          fillColor: [255, 255, 255], textColor: TEXT, overflow: "linebreak"
        },
        headStyles: {
          minCellHeight: 12, fillColor: DARK_PINK, textColor: [255, 255, 255],
          lineColor: DARK_PINK, halign: "center", valign: "middle"
        },
        alternateRowStyles: { fillColor: PALE_PINK },
        showHead: "everyPage", rowPageBreak: "avoid",
        didDrawCell(data) {
          const { x, y, width: w, height: h } = data.cell;
          const col = data.column.index;
          if (data.section === "head") {
            addThaiText(doc, headLabels[col], x, y, w, h,
              { fontSize: 8, weight: 600, color: "#ffffff", align: "center", inset: .7 });
            return;
          }
          const person = filtered[data.row.index];
          if (!person) return;
          if (col === 0) {
            addThaiText(doc, `${person.name || ""}\n${person.classroom || ""}`, x, y, w, h,
              { fontSize: 8.3, weight: 500, color: "#241b2b", inset: 1.2, lineHeight: 1.3 });
          } else if (col === 1) {
            addThaiText(doc, person.activity || "", x, y, w, h,
              { fontSize: 8.2, color: "#241b2b", align: "center", inset: 1.2 });
          } else if (col === 2) {
            const color = person.status === "ผ่าน" ? "#15966b" : person.status === "ไม่ผ่าน" ? "#df4960" : "#bd851c";
            addThaiText(doc, person.status || "รอตรวจสอบ", x, y, w, h,
              { fontSize: 8, weight: 500, color, align: "center", inset: 1 });
          } else if (col === 3) {
            doc.setDrawColor(232, 138, 181);
            doc.setLineWidth(.25);
            doc.roundedRect(x + 2, y + 3, Math.max(4, w - 4), Math.max(5, h - 6), .8, .8, "S");
          }
        }
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setDrawColor(243, 165, 199);
        doc.setLineWidth(.25);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        addThaiText(doc, "PINK Diwaa | SPORTS DAY", margin, pageHeight - 11.5, 75, 6,
          { fontSize: 7, color: "#89818e", inset: 0 });
        addThaiText(doc, `หน้า ${page} / ${totalPages}`, pageWidth - margin - 35, pageHeight - 11.5, 35, 6,
          { fontSize: 7, color: "#89818e", align: "right", inset: 0 });
      }
      doc.save(["PINK-DIWAA", safeName(activity || "ALL-ACTIVITIES"), safeName(status || "ALL-STATUS")].join("-") + ".pdf");
    } catch (error) {
      console.error("Direct PDF Export Error:", error);
      alert("สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่ และตรวจสอบ Console (F12)");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  button.addEventListener("click", generatePDF);
})();



// --------------------------------------------

// BACKUP JSON

// --------------------------------------------



getElement("backupBtn").addEventListener("click", () => {

  const data = {

    version: 3,

    applicants,

    limits,
    categoryLimits,
    staff,
    activities,

    backupDate: new Date().toISOString()

  };



  downloadFile(

    JSON.stringify(data, null, 2),

    "pink-rush-backup.json",

    "application/json"

  );

});



// --------------------------------------------

// RESTORE JSON

// --------------------------------------------



getElement("restoreFile").addEventListener("change", async event => {

  const file = event.target.files[0];

  if (!file) return;



  try {

    const data = JSON.parse(await file.text());



    if (

      !data ||

      !Array.isArray(data.applicants) ||

      !Array.isArray(data.staff) ||

      !data.limits ||

      typeof data.limits !== "object" ||

      Array.isArray(data.limits)

    ) {

      throw new Error("Invalid backup");

    }



    if (!confirm("การนำเข้าจะเขียนทับข้อมูลเดิม ต้องการดำเนินการหรือไม่?")) {

      event.target.value = "";

      return;

    }



    if (Array.isArray(data.activities)) {
      activities = data.activities
        .filter(item => item && typeof item.name === "string" && item.name.trim())
        .map(item => ({
          ...item,
          id: String(item.id || makeId()),
          name: item.name.trim(),
          icon: String(item.icon || "🏅"),
          desc: String(item.desc || ""),
          categories: Array.isArray(item.categories) ? item.categories : defaultCategoriesForActivity(item),
          splitCategories: typeof item.splitCategories === "boolean" ? item.splitCategories : (Array.isArray(item.categories) ? item.categories.length > 0 : defaultCategoriesForActivity(item).length > 0)
        }));
      saveJSON(ACTIVITY_KEY, activities);
      if (cloudReady) {
        queueCloudWrite(async () => {
          // Import is an explicit administrator-confirmed restore, so replace the activity set intentionally.
          await db.ref("pinkRush/data/activities").set(recordsToObject(activities));
          lastKnownActivities = new Map(activities.map(item => [String(item.id), item]));
          activitiesCloudLoaded = true;
        });
      }
    }

    applicants = data.applicants.map(person => ({

      id: String(person.id || makeId()),

      name: String(person.name || ""),

      classroom: String(person.classroom || ""),

      number: String(person.number || ""),

      phone: String(person.phone || ""),

      note: String(person.note || ""),

      activity: String(person.activity || ""),
      category: String(person.category || ""),

      status: ["ผ่าน", "ไม่ผ่าน", "รอตรวจสอบ"].includes(person.status)

        ? person.status

        : "รอตรวจสอบ",

      created: person.created || new Date().toISOString()

    }));



    staff = data.staff.map(person => ({

      id: String(person.id || makeId()),

      activity: String(person.activity || ""),

      name: String(person.name || ""),

      phone: String(person.phone || ""),

      role: String(person.role || "")

    }));



    limits = data.limits;
    categoryLimits = data.categoryLimits && typeof data.categoryLimits === "object" ? data.categoryLimits : {};



    saveData();

    saveStaff();



    renderAdmin();

    renderActivityAdmin();

    renderActivities();

    renderHomeActivities();

    renderStaff();

    renderStaffAdmin();

    renderLimits();



    alert("นำเข้าข้อมูลเรียบร้อยแล้ว" + (cloudReady ? " และกำลังซิงก์ขึ้น Firebase" : " (ยังไม่ได้เชื่อม Firebase)"));



  } catch (error) {

    console.error(error);

    alert("ไฟล์ไม่ถูกต้อง หรือรูปแบบข้อมูลไม่รองรับ");

  }



  event.target.value = "";

});



// --------------------------------------------

// DOWNLOAD FILE

// --------------------------------------------



function downloadFile(content, filename, type) {

  const blob = new Blob([content], { type });

  const url = URL.createObjectURL(blob);



  const link = document.createElement("a");

  link.href = url;

  link.download = filename;



  document.body.appendChild(link);

  link.click();

  link.remove();



  setTimeout(() => URL.revokeObjectURL(url), 1000);

}



// --------------------------------------------

// INITIALIZE

// --------------------------------------------



function initialize() {

  renderHomeActivities();

  renderActivities();

  renderStaff();



  if (isAdmin()) {

    showPage("admin");

  } else {

    showPage("home");

  }

}



initialize();
