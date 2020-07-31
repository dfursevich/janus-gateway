const Switcher = function (remoteFeed, streams, downPacketLostThreshold, upPacketLostThreshold, downDelay, upDelay, onTargetStreamChange) {
	let switches = [];
	let packetLoss = [];
	let targetStream = null;
	let targetStreamExpireAt = new Date().getTime();
	let targetStreamAttemptNumber = 0;
	let setIntervalId = setInterval(function () {
		control();
	}, 1000);

	this.stop = function () {
		clearInterval(setIntervalId);
	};

	this.switchStream = function (stream) {
		switches.push({
			value: stream,
			time: new Date().getTime()
		});
		packetLoss = [];
		targetStream = null;
		targetStreamExpireAt = new Date().getTime();
		targetStreamAttemptNumber = 0;
	}

	const control = function () {
		if (switches.length === 0) return;

		updateStats();

		const current = switches.slice(-1)[0];
		const now = new Date().getTime();
		//if we can switch down
		if (current.value > 0) {
			const lostAvg = avg(leftPad(diff(packetLoss), now - downDelay, 0));
			//if we match packet loss
			if (lostAvg > downPacketLostThreshold) {
				doSwitch(current.value - 1);
				return;
			}
		}

		// if we can switch up
		if (current.value < streams) {
			const lostAvg = avg(leftPad(diff(packetLoss), now - upDelay, downPacketLostThreshold));
			//if we match packet loss
			if (lostAvg <= upPacketLostThreshold) {
				const nextStream = current.value + 1;
				const nextStreamPeriods = []
				for (let i = 0; i < switches.length; i++) {
					if (switches[i].value === nextStream) {
						nextStreamPeriods.push((i + 1 < switches.length ? switches[i + 1].time : new Date().getTime()) - switches[i].time);
					}
				}

				if (nextStreamPeriods.length === 0) {
					doSwitch(nextStream);
				} else {
					const lastPeriod = nextStreamPeriods.slice(-1)[0];
					const currentPeriod = now - current.time;
					const periodCount = nextStreamPeriods.length;
					const upSwitchMagicNumber = lastPeriod * currentPeriod / fib(periodCount);
					if (upSwitchMagicNumber > 20000 * 20000) {
						doSwitch(nextStream);
					}
				}
			}
		}
	};

	const doSwitch = function (nextStream) {
		const now = new Date().getTime();
		if (targetStream !== nextStream || now - targetStreamExpireAt > 0) {
			targetStream = nextStream;
			targetStreamAttemptNumber = targetStreamAttemptNumber + 1;
			targetStreamExpireAt = now + 5000 * fib(targetStreamAttemptNumber);
			onTargetStreamChange(targetStream);
		}
	}

	const updateStats = function () {
		remoteFeed.webrtcStuff.pc.getStats().then(function (stats) {
			stats.forEach(function (res) {
				if (!res) return;
				var inStats = false;
				// Check if these are statistics on incoming media
				if ((res.mediaType === "video" || res.id.toLowerCase().indexOf("video") > -1) &&
					res.type === "inbound-rtp" && res.id.indexOf("rtcp") < 0) {
					// New stats
					inStats = true;
				} else if (res.type == 'ssrc' && res.bytesReceived &&
					(res.googCodecName === "VP8" || res.googCodecName === "")) {
					// Older Chromer versions
					inStats = true;
				}
				// Parse stats now
				if (inStats) {
					packetLoss.push({
						value: res.packetsLost,
						time: res.timestamp
					})
				}
			});
		});
	}

	const diff = function (series) {
		const retVal = [];
		for (let i = 0; i < series.length - 1; i++) {
			retVal.push({
				value: series[i + 1].value - series[i].value,
				time: series[i + 1].time
			})
		}
		return retVal;
	};

	const leftPad = function (series, fromTime, value) {
		const retVal = series.slice();
		const startTime = series.length !== 0 ? series[0].time : new Date().getTime();
		for (let time = fromTime; time < startTime; time += 1000) {
			retVal.unshift({
				value: value,
				time: time
			});
		}
		return retVal;
	};

	const avg = function (series) {
		if (series.length === 0) return 0;
		const sum = series.map(s => s.value).reduce((a, b) => a + b, 0);
		return sum / series.length;
	};

	const fib = function (index) {
		if (index === 0) return 0
		else if (index === 1) return 1
		else return fib(index - 1) + fib(index - 2)
	};
}
