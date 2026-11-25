"use strict";

const TravelAllowance = (() => {
  const DAY_MS = 86_400_000;
  const DAILY = 25_000;
  const ROOM_LIMITS = { seoul: 100_000, metro: 80_000, other: 70_000 };

  function requireCondition(condition, message, field) {
    if (!condition) throw Object.assign(new Error(message), { field });
  }

  function dayNumber(value) {
    return Date.parse(value + "T00:00:00Z") / DAY_MS;
  }

  function tripDays(start, end) {
    return dayNumber(end) - dayNumber(start) + 1;
  }

  function timeMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function calculateLocal(trip, days) {
    const minutes = (days - 1) * 1440 + timeMinutes(trip.returnTime) - timeMinutes(trip.departTime);
    requireCondition(minutes > 0, "복귀 일시는 출발 일시보다 늦어야 합니다.", "return");
    const base = minutes >= 240 ? 20_000 : 10_000;
    const total = trip.localVehicle === "assigned" ? 0 : base - (trip.localVehicle === "public" ? 10_000 : 0);
    return { days, minutes, total, lines: [["근무지 내 출장여비", total]] };
  }

  function calculateDaily(trip, days) {
    let halfFrom = 0;
    let halfTo = -1;
    if (trip.fullVehicleReduction) {
      halfTo = days - 1;
    } else if (trip.vehicleReduction) {
      halfFrom = dayNumber(trip.vehicleStart) - dayNumber(trip.start);
      halfTo = dayNumber(trip.vehicleEnd) - dayNumber(trip.start);
      requireCondition(
        halfFrom >= 0 && halfFrom <= halfTo && halfTo < days,
        "일비 감액 기간을 출장 기간 내에서 선택하세요.",
        "vehicle-start",
      );
    }

    const brackets = trip.longStay
      ? [[0, 15, 1], [16, 30, 0.9], [31, 60, 0.8], [61, days - 1, 0.7]]
      : [[0, days - 1, 1]];
    return brackets.reduce((sum, [from, to, factor]) => {
      const last = Math.min(to, days - 1);
      const count = Math.max(0, last - from + 1);
      const halfDays = Math.max(0, Math.min(last, halfTo) - Math.max(from, halfFrom) + 1);
      return sum + Math.round(DAILY * factor * (count - halfDays / 2));
    }, 0);
  }

  function calculateLodging(trip, days) {
    const nights = trip.rooms.reduce((sum, room) => sum + room.nights, 0);
    requireCondition(nights < days, "숙박 박수 합계는 출장일수보다 적어야 합니다.", "add-lodging");
    const lodging = trip.rooms.reduce((sum, room) => {
      if (trip.grade === "1") return sum + room.cost * room.nights;
      const limit = ROOM_LIMITS[room.region];
      const allowed = room.extra ? limit * 1.3 : limit;
      return sum + Math.min(room.cost, Math.round(allowed)) * room.nights;
    }, 0);
    return { nights, lodging };
  }

  function calculate(trip) {
    const days = tripDays(trip.start, trip.end);
    requireCondition(Number.isSafeInteger(days) && days > 0, "복귀일은 출장일과 같거나 이후여야 합니다.", "end");
    if (trip.scope === "inside") return calculateLocal(trip, days);

    requireCondition(
      trip.mealDays === null || Number.isInteger(trip.mealDays) && trip.mealDays >= 0 && trip.mealDays <= days,
      "식비 지급 대상 일수는 0일부터 전체 출장일수까지 입력할 수 있습니다.",
      "meal-days",
    );
    const daily = calculateDaily(trip, days);
    const meals = (trip.mealDays ?? days) * DAILY;
    const { nights, lodging } = calculateLodging(trip, days);
    const lines = [["운임", trip.fare], ["일비", daily], ["숙박비", lodging], ["식비", meals]];
    if (trip.mileage) {
      requireCondition(
        trip.mileage.extra <= trip.mileage.saving,
        "마일리지 추가 일비는 절약한 항공운임을 초과할 수 없습니다.",
        "mileage-extra",
      );
      lines.push(["공적 항공마일리지 추가 일비", trip.mileage.extra]);
    }
    return { days, nights, lines, total: lines.reduce((sum, [, amount]) => sum + amount, 0) };
  }

  return { calculate, tripDays };
})();

if (typeof module !== "undefined") module.exports = TravelAllowance;
