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



// --------------------------------------------

// ACTIVITIES

// --------------------------------------------



const SPORT_CATEGORIES = ["หญิง ม.ต้น", "หญิง ม.ปลาย", "ชาย ม.ต้น", "ชาย ม.ปลาย"];
const NO_CATEGORY_SPORTS = ["muay-khita", "cheer"];
function defaultCategoriesForActivity(activity) {
  return NO_CATEGORY_SPORTS.includes(activity?.id) || ["คีตะมวยไทย", "หลีด"].includes(activity?.name)
    ? [] : [...SPORT_CATEGORIES];
}

const DEFAULT_ACTIVITIES = [
  { id: "football", name: "ฟุตบอล", icon: "⚽", desc: "การแข่งขันฟุตบอล", categories: SPORT_CATEGORIES },
  { id: "futsal", name: "ฟุตซอล", icon: "⚽", desc: "การแข่งขันฟุตซอล", categories: SPORT_CATEGORIES },
  { id: "basketball", name: "บาสเกตบอล", icon: "🏀", desc: "การแข่งขันบาสเกตบอล", categories: SPORT_CATEGORIES },
  { id: "volleyball", name: "วอลเลย์บอล", icon: "🏐", desc: "การแข่งขันวอลเลย์บอล", categories: SPORT_CATEGORIES },
  { id: "takraw", name: "เซปักตะกร้อ", icon: "🥎", desc: "การแข่งขันเซปักตะกร้อ", categories: SPORT_CATEGORIES },
  { id: "petanque", name: "เปตอง", icon: "🎯", desc: "การแข่งขันเปตอง", categories: SPORT_CATEGORIES },
  { id: "table-tennis", name: "เทเบิลเทนนิส", icon: "🏓", desc: "การแข่งขันเทเบิลเทนนิส", categories: SPORT_CATEGORIES },
  { id: "running", name: "วิ่ง", icon: "🏃", desc: "การแข่งขันวิ่ง", categories: SPORT_CATEGORIES },
  { id: "muay-khita", name: "คีตะมวยไทย", icon: "🥊", desc: "การแข่งขันคีตะมวยไทย", categories: [] },
  { id: "cheer", name: "หลีด", icon: "📣", desc: "กิจกรรมหลีด", categories: [] }
];

let activities = DEFAULT_ACTIVITIES.map(item => ({ ...item, categories: [...item.categories] }));


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



function loadJSON(key, fallback) {

  try {

    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : fallback;

  } catch (error) {

    console.error("Load error:", key, error);

    return fallback;

  }

}



function saveJSON(key, value) {

  localStorage.setItem(key, JSON.stringify(value));

}


// Sports list is centrally defined for this event; Firebase is the shared source of truth.
function saveActivities() {
  saveJSON(ACTIVITY_KEY, activities);
  if (cloudReady) queueCloudWrite(() => syncCollection("activities", activities));
}


function getElement(id) {

  return document.getElementById(id);

}



function getActivity(name) {

  return activities.find(item => item.name === name);

}



function getLimit(name) {

  const value = Number(limits[name]);

  return Number.isFinite(value) && value >= 0 ? value : 30;

}



function getActivityCount(name) {

  return applicants.filter(item => item.activity === name).length;

}



function saveData() {
  // LocalStorage is only a cache; Firebase Realtime Database is the shared database.
  saveJSON(KEY, applicants);
  saveJSON(LIMIT_KEY, limits);
  if (cloudReady) {
    queueCloudWrite(async () => {
      await syncCollection("applicants", applicants);
      await db.ref("pinkRush/data/settings").update({ limits });
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

let staff = loadJSON(STAFF_KEY, []);



if (!Array.isArray(applicants)) applicants = [];

if (!Array.isArray(staff)) staff = [];



if (!limits || typeof limits !== "object" || Array.isArray(limits)) {

  limits = {};

}



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
  if (currentActivity && getActivity(currentActivity)) updateCapacity(currentActivity);
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
    saveJSON(KEY, applicants);
    refreshAllViews();
  });
  bindList("pinkRush/data/staff", value => {
    staff = Object.values(value).filter(Boolean);
    saveJSON(STAFF_KEY, staff);
    refreshAllViews();
  });
  bindList("pinkRush/data/activities", value => {
    activities = Object.values(value).filter(Boolean).map(item => ({
      ...item,
      categories: defaultCategoriesForActivity(item).length
        ? (Array.isArray(item.categories) && item.categories.length ? item.categories : defaultCategoriesForActivity(item))
        : []
    }));
    saveJSON(ACTIVITY_KEY, activities);
    refreshAllViews();
  });
  const settingsRef = db.ref("pinkRush/data/settings");
  const settingsHandler = snapshot => {
    const value = snapshot.val();
    if (value && value.limits && typeof value.limits === "object") {
      limits = value.limits;
      saveJSON(LIMIT_KEY, limits);
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
    const metaSnapshot = await root.child("system").once("value");
    const meta = metaSnapshot.val() || {};
    if (!metaSnapshot.exists()) {
      // First setup: seed the shared database with the approved sports list and any existing local records.
      await root.child("data/activities").set(recordsToObject(DEFAULT_ACTIVITIES));
      await root.child("data/applicants").set(recordsToObject(applicants));
      await root.child("data/staff").set(recordsToObject(staff));
      await root.child("data/settings").set({ limits });
      await root.child("system").set({ initialized: true, initializedAt: firebase.database.ServerValue.TIMESTAMP, schemaVersion: 2 });
    } else if (Number(meta.schemaVersion || 1) < 2) {
      // Upgrade old LocalStorage/Firestore-era sport list without deleting applicant records.
      await root.child("data/activities").set(recordsToObject(DEFAULT_ACTIVITIES));
      await root.child("system").update({ schemaVersion: 2, upgradedAt: firebase.database.ServerValue.TIMESTAMP });
    }
    cloudReady = true;
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



function isAdmin() {

  return localStorage.getItem(SESSION_KEY) === "true";

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

  const max = getLimit(activity.name);

  const full = count >= max;



  return `

    <article class="activity-card ${full ? "full" : ""}"

      data-sport="${escapeHTML(activity.name)}">



      <div class="activity-icon">${activity.icon}</div>

      <h3>${escapeHTML(activity.name)}</h3>

      <p>${escapeHTML(activity.desc)}</p>

      <p>สมัครแล้ว ${count}/${max} คน</p>



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
  const categories = Array.isArray(activity.categories) ? activity.categories : [];
  categoryWrap.classList.toggle("hidden", categories.length === 0);
  categorySelect.required = categories.length > 0;
  categorySelect.innerHTML = categories.length
    ? '<option value="">เลือกประเภทการแข่งขัน</option>' + categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join("")
    : '<option value="">ไม่แยกประเภท</option>';

  getElement("registerMessage").textContent = "";



  updateCapacity(name);

  showPage("sportPage");

}



getElement("backActivities").addEventListener("click", () => {

  showPage("activities");

});



// --------------------------------------------

// CAPACITY

// --------------------------------------------



function updateCapacity(name) {

  const max = getLimit(name);

  const count = getActivityCount(name);

  const remaining = Math.max(0, max - count);

  const full = count >= max;



  getElement("sportCapacity").textContent =

    `สมัครแล้ว ${count} / ${max} คน • เหลือ ${remaining} ที่`;



  const submit = getElement("registerForm")

    .querySelector("button[type='submit']");



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
  const needsCategory = Array.isArray(selectedActivity?.categories) && selectedActivity.categories.length > 0;



  if (!name || !classroom || !currentActivity || (needsCategory && !category)) {

    alert("กรุณากรอกข้อมูลให้ครบ");

    return;

  }



  if (getActivityCount(currentActivity) >= getLimit(currentActivity)) {

    alert("กิจกรรมนี้มีผู้สมัครครบจำนวนแล้ว");

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

    localStorage.setItem(SESSION_KEY, "true");



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



  localStorage.removeItem(SESSION_KEY);

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
    Array.isArray(item.categories) ? item.categories : defaultCategoriesForActivity(item)
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



function getFilteredApplicants() {

  const search = getElement("searchInput").value.trim().toLowerCase();

  const activity = getElement("activityFilter").value;

  const status = getElement("statusFilter").value;
  const category = getElement("categoryFilter").value;



  return applicants.filter(person => {

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



  if (action === "ผ่าน" || action === "ไม่ผ่าน") {

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
      <td>
        <div class="category-admin-list">${(activity.categories || []).map((category, categoryIndex) => `
          <div class="row-actions category-admin-row">
            <span>${escapeHTML(category)}</span>
            <button type="button" class="btn-soft" data-category-edit="${index}" data-category-index="${categoryIndex}">แก้ประเภท</button>
            <button type="button" class="btn-danger" data-category-delete="${index}" data-category-index="${categoryIndex}">ลบ</button>
          </div>`).join("")}</div>
        ${(activity.categories || []).length || !["คีตะมวยไทย", "หลีด"].includes(activity.name) ? `<button type="button" class="btn-soft" data-category-add="${index}">+ เพิ่มประเภท</button>` : `<small>กีฬานี้ไม่แบ่งประเภท</small>`}
        <div class="row-actions" style="margin-top:8px">
          <button type="button" class="btn-soft" data-activity-edit="${index}">แก้ไขกีฬา</button>
          <button type="button" class="btn-danger" data-activity-delete="${index}">ลบกีฬา</button>
        </div>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="5">ยังไม่มีรายการกีฬา</td></tr>';

  tbody.querySelectorAll("[data-activity-edit]").forEach(button => {
    button.addEventListener("click", () => editActivity(Number(button.dataset.activityEdit)));
  });
  tbody.querySelectorAll("[data-activity-delete]").forEach(button => {
    button.addEventListener("click", () => deleteActivity(Number(button.dataset.activityDelete)));
  });
  tbody.querySelectorAll("[data-category-add]").forEach(button => button.addEventListener("click", () => addActivityCategory(Number(button.dataset.categoryAdd))));
  tbody.querySelectorAll("[data-category-edit]").forEach(button => button.addEventListener("click", () => editActivityCategory(Number(button.dataset.categoryEdit), Number(button.dataset.categoryIndex))));
  tbody.querySelectorAll("[data-category-delete]").forEach(button => button.addEventListener("click", () => deleteActivityCategory(Number(button.dataset.categoryDelete), Number(button.dataset.categoryIndex))));
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
  if (["คีตะมวยไทย", "หลีด"].includes(activity.name)) return alert("กีฬานี้ไม่แบ่งประเภท");
  const name = prompt(`เพิ่มประเภทการแข่งขันของ ${activity.name}`);
  if (name === null) return;
  const category = name.trim();
  if (!category) return alert("กรุณากรอกชื่อประเภท");
  activity.categories = Array.isArray(activity.categories) ? activity.categories : [];
  if (activity.categories.some(item => item.toLowerCase() === category.toLowerCase())) return alert("มีประเภทนี้แล้ว");
  activity.categories.push(category);
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
    activities[index] = { ...activities[index], name, icon, desc, categories: ["คีตะมวยไทย", "หลีด"].includes(name) ? [] : (activities[index].categories?.length ? activities[index].categories : [...SPORT_CATEGORIES]) };
    if (previousName !== name) {
      applicants.forEach(person => { if (person.activity === previousName) person.activity = name; });
      staff.forEach(person => { if (person.activity === previousName) person.activity = name; });
      if (Object.prototype.hasOwnProperty.call(limits, previousName)) {
        limits[name] = limits[previousName];
        delete limits[previousName];
      }
      saveData();
      saveStaff();
    }
  } else {
    activities.push({ id: makeId(), name, icon, desc, categories: ["คีตะมวยไทย", "หลีด"].includes(name) ? [] : [...SPORT_CATEGORIES] });
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

    const count = getActivityCount(activity.name);

    const max = getLimit(activity.name);



    return `

      <div class="limit-row">

        <div>

          <strong>${activity.icon} ${escapeHTML(activity.name)}</strong>

          <small>สมัครแล้ว ${count} คน</small>

        </div>



        <input

          type="number"

          min="${count}"

          step="1"

          value="${max}"

          data-limit="${escapeHTML(activity.name)}"

        >

      </div>

    `;

  }).join("");

}



getElement("saveLimits").addEventListener("click", () => {

  let valid = true;

  const newLimits = { ...limits };



  document.querySelectorAll("[data-limit]").forEach(input => {

    const name = input.dataset.limit;

    const count = getActivityCount(name);

    const value = Number(input.value);



    if (!Number.isInteger(value) || value < count || value < 0) {

      valid = false;

      input.value = count;

      return;

    }



    newLimits[name] = value;

  });



  if (!valid) {

    alert("จำนวนรับต้องเป็นจำนวนเต็ม และไม่น้อยกว่าจำนวนผู้สมัครปัจจุบัน");

    return;

  }



  limits = newLimits;

  saveData();



  renderAdmin();

  renderActivities();

  renderHomeActivities();



  if (currentActivity) updateCapacity(currentActivity);



  alert("บันทึกจำนวนรับเรียบร้อยแล้ว");

});



// --------------------------------------------

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



  const filtered = applicants.filter(person =>

    (!activity || person.activity === activity) &&

    (!status || person.status === status)

  );



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
    addThaiText(doc, "PINK RUSH", margin + 4, 11, width * .42, 10,
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
      addHeader(doc, activity || "ทุกกิจกรรม", [status ? `สถานะ: ${status}` : "รายชื่อผู้สมัครทั้งหมด", category].filter(Boolean).join(" | "), search, filtered.length);
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
        addThaiText(doc, "PINK RUSH | SPORTS DAY", margin, pageHeight - 11.5, 75, 6,
          { fontSize: 7, color: "#89818e", inset: 0 });
        addThaiText(doc, `หน้า ${page} / ${totalPages}`, pageWidth - margin - 35, pageHeight - 11.5, 35, 6,
          { fontSize: 7, color: "#89818e", align: "right", inset: 0 });
      }
      doc.save(["PINK-RUSH", safeName(activity || "ALL-ACTIVITIES"), safeName(status || "ALL-STATUS")].join("-") + ".pdf");
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

    version: 2,

    applicants,

    limits,

    staff,

    activities,

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
        .map(item => { const activity = { id: String(item.id || makeId()), name: item.name.trim(), icon: String(item.icon || "🏅"), desc: String(item.desc || "") }; return { ...activity, categories: defaultCategoriesForActivity(activity) }; });
      saveActivities();
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

// STORAGE EVENTS

// --------------------------------------------



window.addEventListener("storage", event => {

  if (![KEY, LIMIT_KEY, STAFF_KEY].includes(event.key)) return;



  applicants = loadJSON(KEY, []);

  limits = loadJSON(LIMIT_KEY, {});

  staff = loadJSON(STAFF_KEY, []);



  renderHomeActivities();

  renderActivities();

  renderStaff();



  if (isAdmin() && !getElement("admin").classList.contains("hidden")) {

    renderAdmin();

  }

});



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
