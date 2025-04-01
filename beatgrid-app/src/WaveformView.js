import './WaveformView.css';
import React from 'react';
import Button from 'react-bootstrap/Button';
import ButtonToolbar from 'react-bootstrap/ButtonToolbar';
import Peaks from 'peaks.js';
import { os, filesystem, server } from '@neutralinojs/lib';
import { colors } from './colors.js';

class WaveformView extends React.Component {
    constructor(props) {
        super(props);

        this.zoomviewRef = React.createRef();
        this.overviewRef = React.createRef();
        this.audioRef = React.createRef();
        this.peaks = null;

        this.state = {
            full_filepath: "initial.mp3",
            audio_source: "initial.mp3",
            waveform_data: "initial.dat",
            windowSize: window.innerWidth
        };
        
        this.handleResize = this.handleResize.bind(this);

        this.files_to_beatgrid = props.files_to_beatgrid;
        this.files_to_tempo_markers = new Map();

        this.downbeat_color = "#D30000";        // red
        this.tempo_marker_color = "#03C04A";    // green
        this.selected_color = "#07944B";        // dark green
        this.other_beat_color = "#45B6FE";      // blue

        this.firstBeatLabel = null;

        this.beatgrid_xml_file = props.beatgrid_xml_file;
        this.previously_written_file = this.beatgrid_xml_file;

        this.zoomLevel = 10.0;  // in seconds

        this.mounted_dirs = [];
    }
    
    render() {
        return (
            <div>
                <div className="zoomview-container" 
                    ref={this.zoomviewRef} 
                    onWheel={this.handleWheel}
                    onMouseEnter={this.changeScroll}
                    onMouseLeave={this.changeScroll}>
                </div>
                <div className="overview-container" ref={this.overviewRef}></div>
                <audio id="audio" ref={this.audioRef} controls="controls">
                    <source src={this.state.audio_source}/>
                    Your browser does not support the audio element.
                </audio>
                <div id="stuff">

                </div>
                {this.renderButtons()}
            </div>
        );
    }

    renderButtons() {
        return (
            <div>
            <ButtonToolbar id="zoomButtons">
                <Button onClick={this.zoomIn}>Zoom in</Button>&nbsp;
                <Button onClick={this.zoomOut}>Zoom out</Button>&nbsp;
            </ButtonToolbar>
            <ButtonToolbar>
                <Button onClick={this.loadNewAudio}>Choose audio</Button>&nbsp;
            </ButtonToolbar>
            <ButtonToolbar>
                <Button onClick={() => this.saveBeatgrid(true)}>Save beatgrid</Button>&nbsp;
                <Button onClick={() => this.saveBeatgrid(false)}>Save beatgrid as...</Button>&nbsp;
            </ButtonToolbar>
            </div>
        );
    }
    
    componentDidMount = async () => {
        window.addEventListener("resize", this.handleResize);

        let mounts = await server.getMounts();
        for (let mount of Object.keys(mounts)) {
            await server.unmount(mount);
        };
        console.log("all unmounted");

        this.initPeaks();
    }

    componentDidUpdate(prevProps, prevState) {
        if (this.props.beatgrid_xml_file !== prevProps.beatgrid_xml_file) {
            console.log("new beatgrid file", this.props.beatgrid_xml_file);
            this.beatgrid_xml_file = this.props.beatgrid_xml_file;
        }

        if (this.props.files_to_beatgrid !== prevProps.files_to_beatgrid) {
            console.log("new", this.props.files_to_beatgrid);
            this.files_to_beatgrid = this.props.files_to_beatgrid;
            this.updateBeatgrid();
        }
    }

    componentWillUnmount = async () => {
        window.addEventListener("resize", null);

        if (this.peaks) {
            this.peaks.destroy();
        }      
    }

    // adapted from https://stackoverflow.com/questions/45644457/action-on-window-resize-in-react
    handleResize(windowSize, event) {
        this.setState({windowSize: window.innerWidth});

        if (this.peaks) {
            const zoomview = this.peaks.views.getView("zoomview");
            const overview = this.peaks.views.getView("overview");
            const scrollbar = this.peaks.views.getScrollbar();

            if (zoomview) {
                zoomview.fitToContainer();
            }

            if (overview) {
                overview.fitToContainer();
            }

            if (scrollbar) {
                scrollbar.fitToContainer();
            }
        }
    }
    
    initPeaks() {
        const options = {
        zoomview: {
            container: this.zoomviewRef.current
        },
        overview: {
            container: this.overviewRef.current,
            enablePoints: false
        },
        mediaElement: this.audioRef.current,
        dataUri: {
            arraybuffer: this.state.waveform_data
        }
        };

        if (this.peaks) {
            this.peaks.destroy();
            this.peaks = null;
        }
        
        Peaks.init(options, (err, peaks) => {
            if (err) {
                console.error('Failed to initialize Peaks instance: ' + err.message);
                return;
            }
        
            this.peaks = peaks;

            this.peaks.on('points.click', this.handleClick);
            this.peaks.on('points.dblclick', this.handleDblClick);
            this.peaks.on('points.mouseenter', this.handleMouseEnter);
            this.peaks.on('points.mouseleave', this.handleMouseLeave);
            this.peaks.on('points.dragstart', this.handleDragStart);
            this.peaks.on('points.dragend', this.handleDragEnd);

            this.onPeaksReady();
        });
    }

    loadNewAudio = async () => {
        let entries = await os.showOpenDialog('Open a file', {
          filters: [
            {name: 'audiowaveform allowed inputs', extensions: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'raw', 'dat', 'json']}
          ]
        });
    
        var audio_source = entries[0]
        console.log("audio source", audio_source);
        let pathParts = await filesystem.getPathParts(audio_source);

        let dir_name;
        let index = this.mounted_dirs.indexOf(pathParts.parentPath);
        if (index === -1) {
            this.mounted_dirs.push(pathParts.parentPath);
            dir_name = "/audio" + (this.mounted_dirs.length - 1).toString();
            await server.mount(dir_name, pathParts.parentPath);
        } else {
            dir_name = "/audio" + index.toString();
        }

        let filename = dir_name + "/" + pathParts.filename;
        await fetch(filename);
        console.log(filename + " fetched");
    
        var output_filename = pathParts.stem + ".dat"; 
        let filename_index = 0;
        let unique_filename = false;

        while (true) {
            try {
                let stats = await filesystem.getStats(output_filename);
            } catch(err) {
                unique_filename = true;
            } 

            if (unique_filename) {
                break;
            }

            output_filename = pathParts.stem + filename_index.toString() + ".dat";
            filename_index++;
        }

        var cmd = "audiowaveform -i '" + audio_source + "' -o '" + output_filename + "' -b 8";
        let info = await os.execCommand(cmd);
        console.log("audiowaveform cmd:", cmd);
        console.log("audiowaveform exit code:", info.exitCode);

        let arraybuffer = await filesystem.readBinaryFile(output_filename);
        await filesystem.remove(output_filename);
        console.log("read array buffer and deleted output_filename");

        this.setState({
            full_filepath: audio_source.replaceAll(" ", "%20"),
            audio_source: filename,
            waveform_data: arraybuffer
        });

        const options = {
            mediaUrl: filename,
            waveformData: {
                arraybuffer: arraybuffer
            }
        };

        this.peaks.setSource(options, (error) => {
            if (error) {
                console.error('Failed to initialize Peaks instance: ' + error.message);
                return;
            } 

            this.onPeaksReady();
        });
    };
    
    onPeaksReady = async () => {
        console.log("Peaks instance ready");
        const zoomview = this.peaks.views.getView('zoomview');
        zoomview.setSegmentDragMode('no-overlap');
        zoomview.setWheelMode('scroll');
        zoomview.setZoom({seconds: this.zoomLevel});

        this.updateBeatgrid();
    }

    calculateColor(bpm) {
        let roundedBPM = Math.round(bpm * 100);
        return colors[roundedBPM % colors.length];
    }

    roundBPM(num) {
        // rounds num to nearest hundredth
        return Math.round(num * 100) / 100;
    }

    roundTime(num) {
        // rounds num to nearest thousandth
        return Math.round(num * 1000) / 1000;
    }

    updateBeatgrid() {
        this.peaks.points.removeAll();
        this.peaks.segments.removeAll();
        console.log("update", this.files_to_beatgrid);

        if (this.files_to_beatgrid.has(this.state.full_filepath)) {
            console.log("found beatgrid for", this.state.full_filepath);

            var epsilon = 0.01;
            var prev_time = null;
            var prev_bpm = null;
            var prev_meter = null;
            var beat_interval = null;
            var bar_num = 1;
            var beat_num = 1;
            var tempo_markers = this.files_to_beatgrid.get(this.state.full_filepath);

            for (var i = 0; i < tempo_markers.length; i++) {
                var tempo_marker = tempo_markers[i];
                var time = tempo_marker.get("sec");
                var bpm = tempo_marker.get("bpm");
                var meter = tempo_marker.get("meter");
                var beat = tempo_marker.get("beat");

                if (i !== 0) {
                    var startTime = prev_time;
                    if (i === 1) {
                        startTime = 0;
                    }

                    this.peaks.segments.add({
                        startTime: startTime,
                        endTime: time,
                        // editable: true,
                        labelText: prev_bpm.toString(),
                        color: this.calculateColor(prev_bpm),
                        markers: true,
                        overlay: true
                    });
                }

                // interpolate the not-explicitly-listed beats
                if (prev_time && time > prev_time + beat_interval) {
                    for (var j = prev_time + beat_interval; j < time - epsilon; j += beat_interval) {
                        beat_num++;
                        if (beat_num > prev_meter[0]) {
                            beat_num = 1;
                            bar_num = bar_num === -1 ? 1 : bar_num + 1;
                        }
                        
                        this.peaks.points.add({
                            time: j,
                            labelText: bar_num.toString() + "." + beat_num.toString(), 
                            color: beat_num === 1 ? this.downbeat_color : this.other_beat_color
                        });
                    }
                } else if (!prev_time) {
                    beat_interval = 60.0 / bpm;
                    var num_beats = Math.floor(time / beat_interval);
                    var num_bars = Math.floor((num_beats - (beat - 1)) / meter[0]) + 1;
                    
                    bar_num = num_bars;
                    if (bar_num <= 0) {
                        bar_num--;
                    }
                    beat_num = beat;

                    for (j = time - beat_interval; j >= 0; j -= beat_interval) {
                        beat_num--;
                        if (beat_num === 0) {
                            beat_num = meter[0];
                            bar_num = bar_num === 1 ? -1 : bar_num - 1;
                        }
                        
                        this.peaks.points.add({
                            time: j,
                            labelText: bar_num.toString() + "." + beat_num.toString(),
                            color: beat_num === 1 ? this.downbeat_color : this.other_beat_color
                        });
                    }

                    bar_num = num_bars;
                    if (bar_num <= 0) {
                        bar_num--;
                    }
                }

                if (beat === beat_num && this.getNumPoints()) {
                    var beat_to_remove = this.getSortedPoints()[this.getNumPoints() - 1];
                    this.peaks.points.removeById(beat_to_remove.id);

                    var prev_beat = this.getSortedPoints()[this.getNumPoints() - 1];
                    prev_beat.update({
                        editable: true,
                        color: this.tempo_marker_color
                    });

                    var prev_segment = this.getSortedSegments()[this.getNumSegments() - 1];
                    prev_segment.update({ endTime: prev_beat.time });

                    let new_bpm = 60.0 / (time - prev_beat.time);
                    this.peaks.segments.add({
                        startTime: prev_beat.time,
                        endTime: time,
                        labelText: this.roundBPM(new_bpm).toString(),
                        color: this.calculateColor(new_bpm),
                        markers: true,
                        overlay: true
                    });
                }

                this.peaks.points.add({ 
                    time: time, 
                    editable: true,
                    labelText: bar_num.toString() + "." + beat.toString(),
                    color: this.tempo_marker_color
                });
                
                beat_num = beat;

                prev_time = time;
                prev_bpm = bpm;
                prev_meter = meter;
                beat_interval = 60.0 / bpm;
            }

            if (prev_time) {
                for (i = prev_time + beat_interval; i <= this.peaks.player.getDuration(); i += beat_interval) {
                    beat_num++;
                    if (beat_num > prev_meter[0]) {
                        beat_num = 1;
                        bar_num = bar_num === -1 ? 1 : bar_num + 1;
                    }
                    
                    this.peaks.points.add({
                        time: i,
                        labelText: bar_num.toString() + "." + beat_num.toString(),
                        color: beat_num === 1 ? this.downbeat_color : this.other_beat_color
                    });
                }
            }

            startTime = prev_time;
            if (!prev_time) {
                startTime = 0;
            }

            this.peaks.segments.add({
                startTime: startTime,
                endTime: this.peaks.player.getDuration(),
                // editable: true,
                labelText: prev_bpm ? prev_bpm.toString() : "N/A",
                color: prev_bpm ? this.calculateColor(prev_bpm) : "black",
                markers: true,
                overlay: true
            });

            let points = this.getSortedPoints();
            this.firstBeatLabel = points[0].labelText;

            let all_tempo_markers = [];
            for (var k = 0; k < points.length; k++) {
                if (points[k].editable) {
                    all_tempo_markers.push(points[k]);
                }
            }
            this.files_to_tempo_markers.set(this.state.full_filepath, all_tempo_markers);
        }

        console.log("beatgrid updated");
    }

    // source: https://stackoverflow.com/questions/55508836/prevent-page-scrolling-when-mouse-is-over-one-particular-div
    changeScroll = () => {
        var style = document.body.style.overflow;
        document.body.style.overflow = (style === 'hidden') ? 'auto' : 'hidden';
    }

    handleWheel = (event) => {
        if (event.deltaY > 0) {
            this.zoomOut();
        } else if (event.deltaY < 0) {
            this.zoomIn();
        }
    };

    getNumPoints() {
        return this.peaks.points.getPoints().length;
    }

    getSortedPoints() {
        // returns points in chronological order
        let points = this.peaks.points.getPoints();
        points.sort(function(a, b) { return a.time - b.time });
        return points;
    }

    getSortedTempoMarkers() {
        // returns only points that are tempo markers in chronological orders
        let tempo_markers = this.files_to_tempo_markers.get(this.state.full_filepath);
        tempo_markers.sort(function(a, b) { return a.time - b.time });
        return tempo_markers;
    }

    getNumSegments() {
        return this.peaks.segments.getSegments().length;
    }

    getSortedSegments() {
        // returns segments in chronological order
        let segments = this.peaks.segments.getSegments();
        segments.sort(function(a, b) { return a.startTime - b.startTime });
        return segments;
    }

    findSegments(time) {
        let segments = this.peaks.segments.getSegments();
        let includedSegments = [];
        for (var i = 0; i < segments.length; i++) {
            if (time >= segments[i].startTime && time <= segments[i].endTime) {
                includedSegments.push(segments[i]);
            }
        }

        return includedSegments;
    }

    findSegmentByStartTime(time) {
        let segments = this.getSortedSegments();
        for (var i = 0; i < segments.length; i++) {
            if (segments[i].startTime === time) {
                return segments[i];
            }
        }

        return null;
    }

    findSegmentByEndTime(time) {
        let segments = this.getSortedSegments();
        for (var i = 0; i < segments.length; i++) {
            if (segments[i].endTime === time) {
                return segments[i];
            }
        }

        return null;
    }

    handleClick = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);
        if (point.editable) {
            return;
        }
        
        point.update({
            editable: true,
            color: this.tempo_marker_color
        });

        let points = this.getSortedPoints();
        let index = points.indexOf(point);

        let next_tempo_marker = null;
        for (var i = index + 1; i < points.length; i++) {
            if (points[i].editable) {
                next_tempo_marker = points[i];
                break;
            }
        }

        let endTime = next_tempo_marker ? 
            next_tempo_marker.time : this.peaks.player.getDuration();
        let segment = this.findSegmentByEndTime(endTime);
        let farthestEndTime = null;
        if (!segment) {
            segment = this.findSegmentByStartTime(0);
            farthestEndTime = segment.endTime;
        }

        segment.update({
            endTime: point.time
        });

        this.peaks.segments.add({
            startTime: point.time,
            endTime: endTime,
            labelText: segment.labelText,
            color: segment.color,
            marker: true,
            overlay: true
        });

        if (farthestEndTime) {
            this.peaks.segments.add({
                startTime: endTime,
                endTime: farthestEndTime,
                labelText: segment.labelText,
                color: segment.color,
                marker: true,
                overlay: true
            });
        }

        let tempo_markers = this.files_to_tempo_markers.get(this.state.full_filepath);
        tempo_markers.push(point);
        this.files_to_tempo_markers.set(this.state.full_filepath, tempo_markers);
    }

    handleDblClick = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);
        if (!point.editable) {
            return;
        }

        let sorted_tempo_markers = this.getSortedTempoMarkers();
        let index = sorted_tempo_markers.indexOf(point);
        let endTime = index === sorted_tempo_markers.length - 1 ?
            this.peaks.player.getDuration() : sorted_tempo_markers[index + 1].time;
        let startTime = index === 0 ? 0 : sorted_tempo_markers[index - 1].time;
        
        point.update({
            editable: false,
            color: point.labelText.split(".")[1] === "1" ?
                this.downbeat_color : this.other_beat_color
        });

        let points = this.getSortedPoints();
        console.log("start", startTime, endTime);
        let numPoints = 0;
        let startIndex = null;
        let endIndex = null;
        for (var i = 0; i < points.length; i++) {
            if (points[i].time === startTime) {
                startIndex = i;
            } else if (points[i].time === endTime) {
                endIndex = i;
            }

            if (points[i].time >= endTime) {
                break;
            }

            if (points[i].time > startTime) {
                numPoints++;
            }
        }
        numPoints++;
        console.log("numPoints", numPoints);

        if (!startIndex) {
            startIndex = -1;
        }

        if (!endIndex) {
            endIndex = this.getNumPoints();
        }

        this.deletePoints(startIndex, endIndex);
        this.fixSegmentAfterAnchoring(startTime, endTime, numPoints, "end");
        this.relabelPoints();
        let segment = this.findSegmentByEndTime(endTime);
        segment.update({startTime: startTime});

        let tempo_markers = this.files_to_tempo_markers.get(this.state.full_filepath);
        tempo_markers.splice(tempo_markers.indexOf(point), 1);
        this.files_to_tempo_markers.set(this.state.full_filepath, tempo_markers);
    }    

    calculateNextBeatLabel(curBeatLabel) {
        var tempo_markers = this.files_to_beatgrid.get(this.state.full_filepath);
        var meter = tempo_markers[0].get("meter");
        
        var beatLabel = curBeatLabel.split(".")
        beatLabel[0] = Number(beatLabel[0]);
        beatLabel[1] = Number(beatLabel[1]);

        beatLabel[1]++;
        if (beatLabel[1] > meter[0]) {
            beatLabel[1] = 1;
            beatLabel[0] = beatLabel[0] === -1 ? 1 : beatLabel[0] + 1;
        }

        return beatLabel[0].toString() + "." + beatLabel[1].toString();
    }

    relabelPoints() {
        let points = this.getSortedPoints();
        let curBeatLabel = this.firstBeatLabel;
        for (var i = 0; i < points.length; i++) {
            points[i].update({labelText: curBeatLabel});
            if (!points[i].editable) {
                points[i].update({color: curBeatLabel.split(".")[1] === "1" ?
                    this.downbeat_color : this.other_beat_color
                });
            }
            curBeatLabel = this.calculateNextBeatLabel(curBeatLabel);
        }
    }
    
    recalculateSegments() {
        this.peaks.segments.removeAll();
        let points = this.getSortedPoints();
        if (points.length < 2) { // TODO: figure out this case
            return; 
        }

        let curBPM = 60.0 / (points[1].time - points[0].time);
        let nextBeat = points[1].time + curBPM;
        let startTime = 0;
        for (var i = 2; i < points.length; i++) {
            if (Math.abs(nextBeat - points[i].time) > 0.01) {
                this.peaks.segments.add({
                    startTime: startTime,
                    endTime: points[i - 1].time,
                    editable: true,
                    labelText: this.roundBPM(curBPM).toString(),
                    color: this.calculateColor(curBPM),
                    markers: true,
                    overlay: true
                });

                startTime = points[i - 1].time;
                curBPM = 60.0 / (points[i].time - points[i - 1].time);
            }

            nextBeat = points[i].time + curBPM;
        }

        this.peaks.segments.add({
            startTime: startTime,
            endTime: this.peaks.player.getDuration(),
            editable: true,
            labelText: this.roundBPM(curBPM).toString(),
            color: this.calculateColor(curBPM),
            markers: true,
            overlay: true
        });
    }

    handleMouseEnter = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);
        point.update({color: this.selected_color});
    }

    handleMouseLeave = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);
        if (point.editable) {
            point.update({color: this.tempo_marker_color});
        } else {
            point.update({color: point.labelText.split(".")[1] === "1" ?
                this.downbeat_color : this.other_beat_color});
        }
    }

    handleDragStart = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);
        let points = this.getSortedPoints();
        let tempo_markers = this.getSortedTempoMarkers();
        let index = tempo_markers.indexOf(point);
        if (index === -1) {
            return;
        }

        point.update({
            minTime: index === 0 ? 0 : tempo_markers[index - 1].time,
            prevTempoMarker: index === 0 ? null : tempo_markers[index - 1],
            maxTime: index === tempo_markers.length - 1 ? 
                this.peaks.player.getDuration() : tempo_markers[index + 1].time,
            nextTempoMarker: index === tempo_markers.length - 1 ?
                null : tempo_markers[index + 1],
            originalTime: point.time
        });

        point.update({
            prevIndex: index === 0 ? -1 : points.indexOf(point.prevTempoMarker),
            nextIndex: index === tempo_markers.length - 1 ?
                this.getNumPoints() : points.indexOf(point.nextTempoMarker),
            originalIndex: points.indexOf(point)
        });
    }

    deletePoints(startIndex, endIndex) {
        let points = this.getSortedPoints();
        let points_to_delete = [];
        
        for (var i = Math.max(startIndex, 0); i < endIndex; i++) {
            if (points[i].editable) {
                continue;
            }

            points_to_delete.push(points[i].id);
        }

        for (i = 0; i < points_to_delete.length; i++) {
            this.peaks.points.removeById(points_to_delete[i]);
        }
    }

    fixSegmentAfterAnchoring(startTime, endTime, numPoints, startOrEnd) {
        let bpm = numPoints * (60.0 / (endTime - startTime));
        let beat_interval = 60.0 / bpm;
        let curTime = startTime;

        for (var i = 1; i < numPoints; i++) {
            curTime += beat_interval;
            this.peaks.points.add({
                time: this.roundTime(curTime),
                color: this.tempo_marker_color
            });
        }

        let segment;
        if (startOrEnd === "start") {
            segment = this.findSegmentByStartTime(startTime);
            if (!segment) {
                segment = this.findSegmentByStartTime(0);
            }
            segment.update({endTime: endTime});
        } else if (startOrEnd === "end") {
            segment = this.findSegmentByEndTime(endTime);
            segment.update({startTime: startTime});
        }

        let new_segment = {
            startTime: segment.startTime,
            endTime: segment.endTime,
            labelText: this.roundBPM(bpm).toString(),
            color: this.calculateColor(bpm),
            markers: true,
            overlay: true
        };

        this.peaks.segments.removeById(segment.id);
        this.peaks.segments.add(new_segment);

        return bpm;
    }

    handleDragEnd = (event) => {
        let point = this.peaks.points.getPoint(event.point.id);

        if (point.time <= point.minTime || point.time >= point.maxTime) {
            point.update({time: point.originalTime});
        } else {
            point.update({time: this.roundTime(point.time)});
            this.deletePoints(point.prevIndex, point.nextIndex);

            if (point.prevTempoMarker) {
                this.fixSegmentAfterAnchoring(point.minTime, 
                                              point.time, 
                                              point.originalIndex - point.prevIndex,
                                              "start");
            }

            let bpm = this.fixSegmentAfterAnchoring(point.time, 
                                                    point.maxTime, 
                                                    point.nextIndex - point.originalIndex,
                                                    "end");

            if (!point.prevTempoMarker) {
                let beat_interval = 60.0 / bpm;
                for (var i = point.time - beat_interval; i > 0; i -= beat_interval) {
                    this.peaks.points.add({
                        time: this.roundTime(i),
                        color: this.tempo_marker_color
                    });
                }

                let segment = this.findSegmentByEndTime(point.maxTime);
                segment.update({startTime: 0});
            }

            this.relabelPoints();
        }
    }
 
    zoomIn = () => {
        if (this.peaks) {
            const zoomview = this.peaks.views.getView('zoomview'); 
            if (this.state.windowSize / (Math.floor(this.zoomLevel) - 1.0) < 170.0) {
                this.zoomLevel = Math.floor(this.zoomLevel) - 1.0;
                zoomview.setZoom({seconds: this.zoomLevel});
            }
        }
    };
    
    zoomOut = () => {
        if (this.peaks) {
            const duration = this.peaks.player.getDuration();
            const zoomview = this.peaks.views.getView('zoomview');
            if (this.zoomLevel + 2 > duration && this.zoomLevel + 1 <= duration) {
                this.zoomLevel = duration;
                zoomview.setZoom({seconds: this.zoomLevel});
            } else if (this.zoomLevel < duration) {
                this.zoomLevel++;
                zoomview.setZoom({seconds: this.zoomLevel});
            }
        }
    };

    saveBeatgrid = async (write_to_previous_file) => {
        let tempo_markers_as_str = "";
        let points = this.getSortedPoints();
        let tempo_markers = [];
        for (let i = 0; i < points.length; i++) {
            if (!points[i].editable) {
                continue;
            }

            let segment = this.findSegmentByStartTime(points[i].time);
            if (!segment) {
                segment = this.findSegmentByStartTime(0);
            }

            let beat_num = points[i].labelText.split(".")[1];

            tempo_markers_as_str +=
                '      <TEMPO Inizio="' + this.roundTime(points[i].time).toString() + '" ' +
                'Bpm="' + segment.labelText + '" ' +
                'Metro="4/4" Battito="' + beat_num + '"/>\r\n';

            let tempo_marker = new Map();
            tempo_marker.set("sec", this.roundTime(points[i].time));
            tempo_marker.set("bpm", Number(segment.labelText));
            tempo_marker.set("meter", [4, 4]);
            tempo_marker.set("beat", Number(beat_num));
            tempo_markers.push(tempo_marker);
        }

        if (this.previously_written_file === null) {
            this.previously_written_file = this.beatgrid_xml_file;
        }
        console.log("filepath:", this.previously_written_file);

        let data = await filesystem.readFile(this.previously_written_file);
        var lines = data.split("\r\n");

        let file_content = "";
        let found_track = false;
        let added_new_tempo_markers = false;
        for (let i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.includes(this.state.full_filepath)) {
                found_track = true;
            }

            if (found_track && line.includes("<TEMPO Inizio=")) {
                if (!added_new_tempo_markers) {
                    file_content += tempo_markers_as_str;
                    added_new_tempo_markers = true;
                }
                continue;
            } else {
                if (line.includes("</TRACK>")) {
                    found_track = false;
                }
                file_content += line + "\r\n";
            }
        }

        if (write_to_previous_file) {
            console.log("writing beatgrid to ", this.previously_written_file);
            await filesystem.writeFile(this.previously_written_file, file_content);
        } else {
            let beatgridPath = await filesystem.getPathParts(this.beatgrid_xml_file);
            let path = await os.showSaveDialog('Save to file', {
                defaultPath: beatgridPath.parentPath,
                filters: [{name: 'beatgrid checkpoint file', extensions: ['xml']}]
            });

            let pathParts = await filesystem.getPathParts(path);
            path = pathParts.parentPath + "/" + pathParts.stem + ".xml";
            
            console.log("writing beatgrid to ", path);
            await filesystem.writeFile(path, file_content);
            
            this.previously_written_file = path;
        }

        this.files_to_beatgrid.set(this.state.full_filepath, tempo_markers);

        console.log("finished writing beatgrid file and updating files_to_beatgrid");
    };
}

export default WaveformView;