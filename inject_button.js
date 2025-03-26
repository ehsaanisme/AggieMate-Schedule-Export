var div = document.createElement("div");
var open = false, exported = false;
div.className = "dropdown inline";
var button = document.createElement("button");
button.className = "btn btn-mini white-on-navyblue";
button.addEventListener("click", parseAndExport);
button.appendChild(document.createTextNode("Export!"));
div.appendChild(button);

var parent = document.getElementsByClassName("menu active")[0] || document.getElementsByClassName("menu active")[1];
parent.appendChild(div);

div.className = "dropdown inline open";
var popupWindow = document.createElement("div");
popupWindow.className = "dropdown-menu defaultcase pull-right";
popupWindow.style.textAlign = "center";

function parseAndExport() {
	if (!open) {
		open = true;
		if (!exported) {
			div.appendChild(popupWindow);
			popupWindow.innerHTML = ''
				+ '<h3 style="text-align:center;border-bottom:2px solid gold">Ready To Export!</h3><br>'
				+ '<p style="text-align:left">How many weeks will your courses last?</p>'
				+ '<input type="number" value="11" id="numweeks"><br><br>'
				+ '<p style="text-align:left">Pick the <em>Monday</em> of the week when classes begin.</p>'
				+ '<input type="date" id="startdate">';
			popupWindow.style.padding = "30px";

			// Collect all the regular (non-final) meeting info
			var dataArray = [];
			var courseContainer = document.getElementById("SavedSchedulesListDisplayContainer");
			var courses = courseContainer.getElementsByClassName("CourseItem");

			for (var i = 0; i < courses.length; i++) {
				var courseName = courses[i].getElementsByClassName("classTitle")[0]?.textContent || "UnknownCourse";
				var meetings = courses[i].getElementsByClassName("meeting");

				for (var j = 0; j < meetings.length; j++) {
					var TBA = false, OLA = false;
					var eventData = {
						courseName: courseName,
						eventName: "",
						time: "",
						days: "",
						location: ""
					};

					var titleEl = meetings[j].querySelector(".smallTitle");
					var infoEls = meetings[j].getElementsByClassName("float-left height-justified");
					if (titleEl) {
						eventData.eventName = titleEl.textContent.trim();
					}

					let infoCount = 0;
					for (let k = 0; k < infoEls.length; k++) {
						if (infoEls[k].classList.contains("smallTitle")) continue;
						let text = infoEls[k].textContent.trim();

						if (text.includes("TBA")) TBA = true;
						if (text.includes("Online Learning Activity")) OLA = true;

						if (infoCount === 0) eventData.time = text;
						else if (infoCount === 1) eventData.days = text;
						else if (infoCount === 2) eventData.location = text;
						infoCount++;
					}

					if (!TBA && !OLA && eventData.time && eventData.days && eventData.location) {
						dataArray.push(eventData);
					} else {
						console.log("Skipping TBA/OLA or incomplete event:", eventData);
						popupWindow.innerHTML += `<p style="text-align:left;font-size:10px">(NOTE: ${courseName.substr(0, 10)}... ${eventData.eventName} could not be parsed. Will not be exported.)</p>`;
					}
				}
			}

			var submit = document.createElement("button");
			submit.className = "btn btn-mini white-on-navyblue";
			submit.textContent = "Go!";
			submit.addEventListener("click", function () {
				console.log("Go button clicked.");
				var eventArray = [];

				var numWeeks = document.getElementById("numweeks").value;
				var startDate = document.getElementById("startdate").value;
				var [year, month, day] = startDate.split('-');
				month = parseInt(month) - 1; // zero-index month

				if (!year || !startDate) {
					alert("Please select a valid start date before exporting!");
					return;
				}

				// Build recurring events for classes (stop after numWeeks - 1)
				for (var i = 0; i < dataArray.length; i++) {
					var ev = createEvent(
						year, month, day, numWeeks,
						dataArray[i].courseName,
						dataArray[i].eventName,
						dataArray[i].time,
						dataArray[i].days,
						dataArray[i].location
					);
					eventArray.push(ev);
				}

				// Now parse final exams
				var courseContainer = document.getElementById("SavedSchedulesListDisplayContainer");
				var courses = courseContainer.getElementsByClassName("CourseItem");

				for (var i = 0; i < courses.length; i++) {
					var cName = courses[i].getElementsByClassName("classTitle")[0]?.textContent || "UnknownCourse";

					// We'll use a regex to safely parse "Final Exam: 6/12/2025 10:30 AM"
					var divs = courses[i].getElementsByTagName("div");
					for (let d = 0; d < divs.length; d++) {
						let text = divs[d].textContent.trim();
						if (text.includes("Final Exam:")) {
							let finalRegex = /Final Exam:\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})\s*(AM|PM)/i;
							let match = finalRegex.exec(text);
							if (!match) {
								console.warn("Couldn't parse final exam from:", text);
								continue;
							}
							// match[1] = "MM/DD/YYYY", match[2] = "hh:mm", match[3] = "AM" or "PM"
							let [full, datePart, timePart, ampm] = match;
							let [mm, dd, yyyy] = datePart.split("/").map(Number);
							let [hh, minute] = timePart.split(":").map(Number);

							if (ampm.toUpperCase() === "PM" && hh < 12) hh += 12;
							if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;

							let startExam = new Date(yyyy, mm - 1, dd, hh, minute);
							let endExam = new Date(startExam.getTime() + 2 * 60 * 60 * 1000); // assume 2-hour exam
							eventArray.push({
								summary: cName + " Final Exam",
								location: "UC Davis",
								start: { dateTime: startExam.toISOString() },
								end: { dateTime: endExam.toISOString() },
								recurrence: []
							});
						}
					}
				}

				console.log("Final eventArray:", eventArray);
				exportToICS(eventArray);
			});
			popupWindow.appendChild(submit);

		} else {
			div.appendChild(popupWindow);
		}
	} else {
		open = false;
		div.removeChild(popupWindow);
	}
}

// Creates a recurring event for the weekly class schedule
function createEvent(year, month, day, numWeeks, courseName, parsedName, parsedTime, parsedDays, parsedLocation) {
	var [startAMPM, endAMPM] = parsedTime.split('-').map(s => s.trim());
	var startAMPMStr = (startAMPM.match(/\s(.*)$/) || [])[1] || "AM";
	var endAMPMStr = (endAMPM.match(/\s(.*)$/) || [])[1] || "AM";

	var start = {
		hours: Number(startAMPM.match(/^(\d+)/)[1]) || 0,
		minutes: Number(startAMPM.match(/:(\d+)/)[1]) || 0
	};
	if (startAMPMStr.toUpperCase() === "PM" && start.hours < 12) start.hours += 12;
	if (startAMPMStr.toUpperCase() === "AM" && start.hours === 12) start.hours = 0;

	var end = {
		hours: Number(endAMPM.match(/^(\d+)/)[1]) || 0,
		minutes: Number(endAMPM.match(/:(\d+)/)[1]) || 0
	};
	if (endAMPMStr.toUpperCase() === "PM" && end.hours < 12) end.hours += 12;
	if (endAMPMStr.toUpperCase() === "AM" && end.hours === 12) end.hours = 0;

	var startDateTime = new Date(year, month, day, start.hours, start.minutes);
	var endDateTime = new Date(year, month, day, end.hours, end.minutes);

	switch ((parsedDays[0] || "").toUpperCase()) {
		case 'T': startDateTime.setDate(startDateTime.getDate() + 1); endDateTime.setDate(endDateTime.getDate() + 1); break;
		case 'W': startDateTime.setDate(startDateTime.getDate() + 2); endDateTime.setDate(endDateTime.getDate() + 2); break;
		case 'R': startDateTime.setDate(startDateTime.getDate() + 3); endDateTime.setDate(endDateTime.getDate() + 3); break;
		case 'F': startDateTime.setDate(startDateTime.getDate() + 4); endDateTime.setDate(endDateTime.getDate() + 4); break;
		default: // Monday, or unknown
			break;
	}

	// Classes end at numWeeks-1 so final week is left for exams
	var untilDate = addDays(endDateTime, (numWeeks - 1) * 7);

	var endMonth = String(untilDate.getMonth() + 1).padStart(2, '0');
	var endDay = String(untilDate.getDate()).padStart(2, '0');

	return {
		summary: courseName + " " + parsedName,
		location: parsedLocation,
		start: { dateTime: startDateTime.toISOString() },
		end: { dateTime: endDateTime.toISOString() },
		recurrence: [
			"RRULE:FREQ=WEEKLY;UNTIL=" + untilDate.getFullYear() + endMonth + endDay + ";BYDAY=" + toBYDAY(parsedDays)
		]
	};
}

// Convert "TR" -> "TU,TH" for RRULE
function toBYDAY(parsedDays) {
	var days = "";
	for (var i = 0; i < parsedDays.length; i++) {
		if (i !== 0) days += ",";
		switch (parsedDays[i].toUpperCase()) {
			case 'M': days += "MO"; break;
			case 'T': days += "TU"; break;
			case 'W': days += "WE"; break;
			case 'R': days += "TH"; break;
			case 'F': days += "FR"; break;
		}
	}
	return days;
}

function addDays(date, days) {
	var out = new Date(date.getTime());
	out.setDate(date.getDate() + days);
	return out;
}

function exportToICS(eventArray) {
	console.log("Exporting to ICS, events:", eventArray);

	let icsContent = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//UC Davis Schedule Builder Export//EN"
	];

	eventArray.forEach(event => {
		icsContent.push("BEGIN:VEVENT");
		icsContent.push("SUMMARY:" + event.summary);
		icsContent.push("LOCATION:" + event.location);

		let start = new Date(event.start.dateTime);
		let end = new Date(event.end.dateTime);

		icsContent.push("DTSTART;TZID=America/Los_Angeles:" + formatDateICS(start));
		icsContent.push("DTEND;TZID=America/Los_Angeles:" + formatDateICS(end));

		if (event.recurrence && event.recurrence.length > 0) {
			icsContent.push(event.recurrence[0]);
		}

		icsContent.push("END:VEVENT");
	});

	icsContent.push("END:VCALENDAR");

	const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "schedule_export.ics";
	link.click();

	popupWindow.innerHTML = '🎉 <strong style="color:gold">Downloaded <code>schedule_export.ics</code></strong>. You can now import it into <strong>ANY</strong> calendar. <span style="color:#2196F3">Ooooweeeee!</span>';
	exported = true;
}

function formatDateICS(date) {
	return (
		date.getFullYear().toString() +
		pad2(date.getMonth() + 1) +
		pad2(date.getDate()) +
		"T" +
		pad2(date.getHours()) +
		pad2(date.getMinutes()) +
		pad2(date.getSeconds())
	);
}

function pad2(n) {
	return n < 10 ? "0" + n : n;
}

window.onresize = function () {
	parent = document.getElementsByClassName("menu active")[0] || document.getElementsByClassName("menu active")[1];
	parent.appendChild(div);
};