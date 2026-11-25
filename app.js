"use strict";

const byId = (id) => document.getElementById(id);
const form = byId("trip-form");
const numberFormat = new Intl.NumberFormat("ko-KR");
const currency = (amount) => numberFormat.format(amount) + "원";
const numeric = (id) => byId(id).valueAsNumber;
let currentReport = null;
let excelSaving = false;

function syncReportActions() {
  byId("print-result").disabled = currentReport === null;
  byId("save-excel").disabled = currentReport === null || excelSaving;
  byId("print-report").hidden = currentReport === null;
}

function show(id, visible) {
  const container = byId(id);
  container.hidden = !visible;
  for (const control of container.querySelectorAll("input, select, button")) {
    control.disabled = !visible;
  }
}

function readConditions() {
  const scope = form.elements.scope.value;
  const transport = byId("transport").value;
  const publicTransport = transport === "public";
  const fullVehicleReduction = publicTransport && byId("public-kind").value === "vehicle";
  const airOrSea = transport === "air" || transport === "ship" || publicTransport && !fullVehicleReduction;
  return {
    scope,
    transport,
    publicTransport,
    fullVehicleReduction,
    airOrSea,
    mealException: airOrSea || transport === "mixed" && byId("mixed-meal").checked,
    vehicleReduction: !fullVehicleReduction && byId("vehicle-discount").checked,
    fareRequired: transport !== "none" && !publicTransport,
    mileageAvailable: transport === "air" || transport === "mixed",
  };
}

function syncForm() {
  const conditions = readConditions();
  const outside = conditions.scope === "outside";
  show("inside-fields", !outside);
  show("outside-grade", outside);
  show("transport-panel", outside);
  show("lodging-panel", outside);
  const start = byId("start").value;
  const end = byId("end").value;
  byId("end").min = start;
  if (!outside) return;

  const { transport, publicTransport, fullVehicleReduction, mealException, vehicleReduction, fareRequired, mileageAvailable } = conditions;
  show("fare-field", fareRequired);
  show("fare-hint", fareRequired);
  show("car-field", transport === "car");
  show("public-kind-field", publicTransport);
  show("mixed-meal-field", transport === "mixed");
  show("meal-field", mealException);
  show("vehicle-field", !fullVehicleReduction);
  show("vehicle-dates", vehicleReduction);
  show("mileage-field", mileageAvailable);
  show("mileage-values", mileageAvailable && byId("mileage-used").checked);

  const duration = TravelAllowance.tripDays(start, end);
  byId("meal-days").max = Number.isFinite(duration) && duration >= 1 ? duration : "";
  for (const id of ["vehicle-start", "vehicle-end"]) {
    byId(id).min = start;
    byId(id).max = end;
  }
  const carApproved = byId("car-rule").value === "approved";
  const hints = {
    rail: "지급 구분에 해당하는 등급의 할인 적용 운임을 입력하세요.",
    bus: "할인이 적용된 왕복 버스 요금을 입력하세요.",
    air: "좌석 등급 기준과 공적 마일리지 사용으로 감액된 금액을 반영하세요.",
    ship: "지급 구분에 해당하는 등급의 할인 적용 운임을 입력하세요.",
    car: carApproved ? "지급 기준에 따라 인정된 연료비·통행료 등을 합산하세요." : "지급 구분에 따른 철도 또는 버스 운임을 입력하세요.",
    mixed: "이용한 교통수단별 인정 운임을 합산하세요. 공용 교통수단의 운임은 0원입니다.",
  };
  byId("fare-hint").textContent = hints[transport] ?? "";
  byId("fare-label").textContent = transport === "car" && carApproved ? "인정 연료비·통행료 등 (원)" : "인정 운임 (원)";
  byId("lodging-hint").textContent = mealException
    ? "지급 대상인 실제 육지 숙박만 추가하세요. 선박 또는 기내에서 보낸 밤은 제외합니다."
    : "숙박비를 청구할 경우 실제 숙박 정보를 추가하세요.";

  for (const row of byId("lodging-list").children) {
    const extraField = row.querySelector('[data-field="extra-field"]');
    extraField.hidden = byId("grade").value !== "2";
    row.querySelector('[data-field="extra"]').disabled = extraField.hidden;
  }
}

function readTrip() {
  const conditions = readConditions();
  const trip = { scope: conditions.scope, start: byId("start").value, end: byId("end").value };
  if (trip.scope === "inside") {
    return {
      ...trip,
      departTime: byId("depart").value,
      returnTime: byId("return").value,
      localVehicle: byId("local-vehicle").value,
    };
  }

  const grade = byId("grade").value;
  const rooms = Array.from(byId("lodging-list").children, (row) => {
    const field = (name) => row.querySelector('[data-field="' + name + '"]');
    return {
      region: field("region").value,
      nights: field("nights").valueAsNumber,
      cost: field("cost").valueAsNumber,
      extra: grade === "2" && field("extra").checked,
    };
  });
  return {
    ...trip,
    grade,
    rooms,
    fare: conditions.fareRequired ? numeric("fare") : 0,
    mealDays: conditions.mealException ? numeric("meal-days") : null,
    fullVehicleReduction: conditions.fullVehicleReduction,
    vehicleReduction: conditions.vehicleReduction,
    vehicleStart: byId("vehicle-start").value,
    vehicleEnd: byId("vehicle-end").value,
    longStay: byId("long-stay").checked,
    mileage: conditions.mileageAvailable && byId("mileage-used").checked
      ? { saving: numeric("mileage-saving"), extra: numeric("mileage-extra") }
      : null,
  };
}

function invalidateResult() {
  const hadResult = !byId("breakdown").hidden;
  currentReport = null;
  syncReportActions();
  byId("error").hidden = true;
  byId("export-error").hidden = true;
  byId("breakdown").hidden = true;
  byId("total").textContent = "—";
  if (hadResult) byId("result-context").textContent = "조건이 바뀌었습니다. 여비를 다시 계산하세요.";
  else if (byId("start").value && byId("end").value) byId("result-context").textContent = "조건을 입력한 뒤 여비 계산을 누르세요.";
  else byId("result-context").textContent = "출장일과 복귀일을 입력하세요.";
}

function renderDefinitions(list, entries) {
  list.replaceChildren();
  for (const [label, description] of entries) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = description;
    row.append(term, value);
    list.append(row);
  }
}

function displayResult(trip, result) {
  const outside = trip.scope === "outside";
  const scopeLabel = outside ? "근무지 외" : "근무지 내";
  const duration = outside
    ? result.days + "일 · 청구 숙박 " + result.nights + "박"
    : Math.floor(result.minutes / 60) + "시간 " + result.minutes % 60 + "분";
  const details = [
    ["출장 구분", scopeLabel],
    ["출장일", outside ? trip.start : trip.start + " " + trip.departTime],
    ["복귀일", outside ? trip.end : trip.end + " " + trip.returnTime],
    ["출장 기간", duration],
  ];
  if (outside) {
    details.push(["여비 지급 구분", "제" + trip.grade + "호"]);
    details.push(["교통수단", byId("transport").selectedOptions[0].textContent]);
  }
  currentReport = { ...result, start: trip.start, end: trip.end, details };

  byId("total").textContent = currency(result.total);
  byId("result-context").textContent = scopeLabel + " · 출장 " + duration;
  const breakdown = byId("breakdown");
  const amounts = result.lines.map(([label, amount]) => [label, currency(amount)]);
  renderDefinitions(breakdown, amounts);
  breakdown.hidden = false;
  byId("error").hidden = true;
  byId("export-error").hidden = true;

  renderDefinitions(byId("print-details"), details);
  byId("print-lines").replaceChildren();
  for (const [label, amount] of amounts) {
    const row = byId("print-lines").insertRow();
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = label;
    row.append(heading);
    row.insertCell().textContent = amount;
  }
  byId("print-total").textContent = currency(result.total);
  syncReportActions();
}

form.addEventListener("input", () => {
  syncForm();
  invalidateResult();
});

form.addEventListener("invalid", (event) => {
  const details = event.target.closest("details");
  if (details) details.open = true;
}, true);

byId("add-lodging").addEventListener("click", () => {
  const row = byId("lodging-template").content.firstElementChild.cloneNode(true);
  row.querySelector('[data-field="remove"]').addEventListener("click", () => {
    row.remove();
    byId("add-lodging").focus();
    invalidateResult();
  });
  byId("lodging-list").append(row);
  syncForm();
  invalidateResult();
  row.querySelector("select").focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const trip = readTrip();
    displayResult(trip, TravelAllowance.calculate(trip));
  } catch (error) {
    if (!error.field) throw error;
    invalidateResult();
    const field = byId(error.field);
    const details = field.closest("details");
    if (details) details.open = true;
    byId("error").textContent = error.message;
    byId("error").hidden = false;
    field.focus();
  }
});

byId("print-result").addEventListener("click", () => {
  if (currentReport) window.print();
});

byId("save-excel").addEventListener("click", async () => {
  if (!currentReport || excelSaving) return;
  const report = currentReport;
  excelSaving = true;
  syncReportActions();
  byId("export-error").hidden = true;
  try {
    await ExcelReport.download(report);
  } catch (error) {
    console.error(error);
    if (currentReport === report) {
      byId("export-error").textContent = "엑셀 파일을 저장하지 못했습니다. 다시 시도해 주세요.";
      byId("export-error").hidden = false;
    }
  } finally {
    excelSaving = false;
    syncReportActions();
  }
});

syncForm();
