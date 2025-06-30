export function formatDate(dateStr, nonBreaking = false) {
  if (!dateStr) {
    return "";
  }

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const [year, month, day] = dateStr.split("-");
  const monthName = months[parseInt(month) - 1];
  const dayNum = parseInt(day, 10);

  if (nonBreaking) {
    return `${monthName}&nbsp;${dayNum},&nbsp;${year}`;
  }

  return `${monthName} ${dayNum}, ${year}`;
}
