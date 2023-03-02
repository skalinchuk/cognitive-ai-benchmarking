const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const projName = urlParams.get("projName");
const expName = urlParams.get("expName");
const iterName = urlParams.get("iterName");


const fetchData = () => {
    const requestData = {
        proj_name: projName,
        exp_name: expName,
        iter_name: iterName,
    };

    socket.emit("getStatistics", requestData);

    socket.on("statistics", (data) => {
        showStatistics(data.statistics);
    });
};

const showStatistics = (statistics) => {
    for (const count of Object.keys(statistics.gamesPlayed)) {
        const tableRow = document.createElement("tr");
        const tableCol1 = document.createElement("td");
        tableCol1.innerHTML = count;
        tableRow.appendChild(tableCol1);
        const tableCol2 = document.createElement("td");
        tableCol2.innerHTML = statistics.gamesPlayed[count];
        tableRow.appendChild(tableCol2);
        document.getElementById("games-played-body").appendChild(tableRow);
    }

    for (const count of Object.keys(statistics.gamesCompleted)) {
        const tableRow = document.createElement("tr");
        const tableCol1 = document.createElement("td");
        tableCol1.innerHTML = count;
        tableRow.appendChild(tableCol1);
        const tableCol2 = document.createElement("td");
        tableCol2.innerHTML = statistics.gamesCompleted[count];
        tableRow.appendChild(tableCol2);
        document.getElementById("games-completed-body").appendChild(tableRow);
    }

    for (const sequence of statistics.nextSequences) {
        const tableRow = document.createElement("tr");
        const tableCol1 = document.createElement("td");
        tableCol1.innerHTML = sequence.id;
        tableRow.appendChild(tableCol1);
        const tableCol2 = document.createElement("td");
        tableCol2.innerHTML = sequence.games_completed;
        tableRow.appendChild(tableCol2);
        const tableCol3 = document.createElement("td");
        tableCol3.innerHTML = sequence.last_served;
        tableRow.appendChild(tableCol3);
        document.getElementById("sequence-list").appendChild(tableRow);
    }
}