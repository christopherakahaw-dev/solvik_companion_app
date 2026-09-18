// Paste this whole file into the browser console with the app open, then reload.
//
// The "Add a week of sample trips" button already seeds a learned commute, but
// it fixes that commute at 08:10. Demo at any other hour and the next occurrence
// is tomorrow morning, which falls outside LTA's same-day forecast — so the
// crowd warning, the one thing FlowGuard exists to show, correctly reports that
// it has nothing to say. Correct, and useless five minutes before you present.
//
// This seeds the same commute at a time you choose, so the forecast has
// something to say about it whenever you run the demo.
//
// It writes only this browser's local storage. Nothing is sent anywhere, and
// "Forget everything" on the Plan tab clears all of it.

(() => {
  // How far ahead the commute should be. Leave it around 45 and the Today card
  // reads "leave in about three quarters of an hour", which is the story you
  // want on stage.
  //
  // The recorded forecast peaks 08:00–09:00 and 18:00–19:00, the two peaks a
  // Singapore weekday actually has. Land the commute inside one of those and the
  // card reads "Busy at Bishan"; land it at 14:00 and it honestly reads "Light",
  // because that is what the data says. If you want the crowded headline,
  // rehearse near a peak or set this so the trip falls in one.
  const MINUTES_FROM_NOW = 45;

  const YISHUN = { name: "Yishun", address: "101 Yishun Central", ll: [1.42945, 103.83513] };
  const RAFFLES = { name: "Raffles Place", address: "5 Raffles Place", ll: [1.28406, 103.85152] };

  const target = new Date(Date.now() + MINUTES_FROM_NOW * 60000);
  const mins = target.getHours() * 60 + target.getMinutes();
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const place = (id, p) => ({ id, name: p.name, address: p.address, ll: p.ll, source: "onemap", verified: true });
  const endpoint = (id, p) => ({ id, label: p.name, place: p.name, ll: p.ll });

  // Four finished weekday trips at that time, which is the bar the pattern
  // detector actually requires — four journeys, three finished, consistent days,
  // inside a 45-minute spread, seen in the last three weeks.
  const journeys = [];
  const cursor = new Date();
  while (journeys.length < 4) {
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getDay() === 0 || cursor.getDay() === 6) continue;
    const at = new Date(cursor);
    // A few minutes of drift per day, so the evidence looks like a person
    // rather than a cron job — and still inside the 45-minute spread.
    at.setHours(target.getHours(), target.getMinutes() + journeys.length * 3, 0, 0);
    journeys.push({
      id: `demo${journeys.length}`,
      at: at.getTime(),
      fromLL: YISHUN.ll, fromName: YISHUN.name,
      toLL: RAFFLES.ll, toName: RAFFLES.name,
      mode: "Comfort", legs: ["NSL"],
      started: true, completed: true,
    });
  }

  const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem("solvik:onboarded", "1");
  set("solvik:places", { version: 2, places: { home: place("home", YISHUN), work: place("work", RAFFLES) } });
  set("solvik:journeys", journeys);
  set("solvik:patternsRejected", []);
  // Deliberately NOT writing solvik:commutes. The journeys above clear the bar
  // the pattern detector sets, so the app infers the commute itself on the next
  // load — which is the thing worth showing. A commute written straight into
  // storage would look identical on screen and prove nothing.
  set("solvik:commutes", []);

  const hhmm = `${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")}`;
  console.log(`Seeded: Yishun → Raffles Place at ${hhmm}, ${journeys.length} past trips. Reload the page.`);
})();
