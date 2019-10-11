let wsUrl = location.hostname
if (location.port) {
    wsUrl += ':' + location.port
}
let protocol = 'ws'
if (location.protocol == 'https:') {
    protocol = 'wss'
}
const ws = new WebSocket(protocol + '://' + wsUrl)


var tv = 1000;
var maxPoints = 30
var previousTime = null;

var cpu = new Rickshaw.Graph( {
	element: document.getElementById("cpuChart"),
	height: 200,
    renderer: 'line',
    gapSize: 0,
	stroke: true,
	preserve: true,
	series: new Rickshaw.Series.FixedDuration([{ name: 'memory' }], undefined, {
		timeInterval: 250,
		maxDataPoints: 30
    }),
    'min': 0,
    'max': 1
});
var memory = new Rickshaw.Graph( {
	element: document.getElementById("memoryChart"),
	height: 200,
    renderer: 'line',
    gapSize: 0,
	stroke: true,
	preserve: true,
	series: new Rickshaw.Series.FixedDuration([{ name: 'system' }], undefined, {
		timeInterval: 250,
		maxDataPoints: 30
    }),
    'min': 0
});

var graph = new Rickshaw.Graph( {
	element: document.getElementById("travisChart"),
	height: 200,
    renderer: 'bar',
    gapSize: 0,
	stroke: true,
	preserve: true,
	series: new Rickshaw.Series.FixedDuration([{ name: 'job' }], undefined, {
		timeInterval: tv,
		maxDataPoints: maxPoints,
		timeBase: new Date().getTime() / 1000
	}) 
} );

var state = new Rickshaw.Graph( {
	element: document.getElementById("stateChart"),
	height: 200,
    renderer: 'bar',
    stroke: true,
	preserve: true,
	series: [
		{
			name: 'Sate',
            color: '#c05020',
            data: []
        }
	]
});

var resize = function() {
	state.configure({
		width: state.element.parentElement.offsetWidth,
		height: 200
    });
    graph.configure({
		width: graph.element.parentElement.offsetWidth,
		height: 200
    });
    cpu.configure({
		width: cpu.element.parentElement.offsetWidth,
		height: 200
	});
	state.render();
}
window.addEventListener('resize', resize); 
resize();

var stateMap = {
    0: 'Started',
    1: 'Passed',
    2: 'Failed',
    3: 'Errored',
    4: 'Queued',
    5: 'Received'
};

var format = function(n) {
	return stateMap[n];
}
var x_ticks = new Rickshaw.Graph.Axis.X( {
	graph: state,
	orientation: 'bottom',
	element: document.getElementById('stateChart_x_axis'),
	// pixelsPerTick: 200,
	tickFormat: format
} );


new Rickshaw.Graph.Axis.Time({
    graph: graph,
    timeUnit: {
        name: 'fixed',
        seconds: 1,
		formatter: function(d) { return Math.floor((new Date() - d)/1000) + 's' }
    }
});
new Rickshaw.Graph.Axis.Time({
    graph: cpu,
    timeUnit: {
        name: 'fixed',
        seconds: 1,
		formatter: function(d) { return Math.floor((new Date() - d)/1000) + 's' }
    }
});
new Rickshaw.Graph.Axis.Time({
    graph: memory,
    timeUnit: {
        name: 'fixed',
        seconds: 1,
		formatter: function(d) { return Math.floor((new Date() - d)/1000) + 's' }
    }
});

new Rickshaw.Graph.HoverDetail({
    graph: graph
});
new Rickshaw.Graph.HoverDetail({
    graph: state
});
new Rickshaw.Graph.HoverDetail({
    graph: cpu
});
new Rickshaw.Graph.HoverDetail({
    graph: memory
});
  
graph.render();
cpu.render();
state.render();

const times = {
    job: {},
    build: {},
    job_updated: {},
    job_finished: {},
    build_updated: {},
    build_finished: {},
}

var iv = setInterval( function() {
    const d = new Date()
    if (previousTime == null) {
        previousTime = Math.floor(d.getTime()/1000) - 1
    }
    const key = previousTime++

    var data = {};
    for (let i in times) {
        data[i] = (times[i][key] || []).length
        for (let k in times[i]) {
            if (parseInt(k) < key - (maxPoints * tv / 1000)) {
                delete times[i][k];
            }
        }
    }
	graph.series.addData(data);
    graph.render();
    
    const currentSate = {}
    for (let i in times) {
        for (let k in times[i]) {
            for (let job of times[i][k]) {
                if (currentSate[job.state] == null) {
                    currentSate[job.state] = 0
                }
                currentSate[job.state]++
            }
        }
    }
    const value = []
    index = 0
    for (let k in stateMap) {
        k = parseInt(k)
        value.push({
            x: k,
            y: currentSate[stateMap[k].toLowerCase()] || 0
        })
    }
    state.series[0].data = value;
    state.render();
}, tv );


ws.onmessage = m => {
    if (m.data[0] == '{') {
        const data =JSON.parse(m.data);
        if (data.event == 'os') {
            cpu.series.addData(data.data.load);
            cpu.render();

            memory.series.addData({memory: data.data.memory});
            memory.render();
            return;
        }
        const d = new Date()
        const key = Math.floor(d.getTime()/1000)
        if (times[data.event][key] == null) {
            times[data.event][key] = []
        }
        times[data.event][key].push(data.data)
    }
}