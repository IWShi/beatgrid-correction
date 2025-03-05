import './App.css';
import React from 'react';
import Button from 'react-bootstrap/Button';

import WaveformView from './WaveformView';
import { os, filesystem, window } from '@neutralinojs/lib';

function readVal(line, attrName) {
  var idx = line.indexOf(attrName);
  var val = "";
  for (var j = idx + attrName.length; ; j++) {
    if (line[j] === "\"") {
      break;
    }
    val += line[j];
  }

  return val;
}

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      files_to_beatgrid: new Map(),
      beatgrid_xml_file: null,
      showing_help: false
    };

    this.setWindow();
  }

  render() {
    const { showing_help } = this.state;
    return (
      <div className="App" id="windowDiv">
        <div>
          <WaveformView 
            files_to_beatgrid={this.state.files_to_beatgrid} 
            beatgrid_xml_file={this.state.beatgrid_xml_file}></WaveformView>
          <Button onClick={this.loadBeatgrid}>Import rekordbox beatgrid</Button>
        </div>
        <div id="helpDiv">
          <Button onClick={() => this.setState({showing_help: !showing_help})}>HELP</Button>
          {
            showing_help 
              ? <p id="help">
                  <strong>Choose audio:</strong> Click this button to load an audio file. 
                  In order for the beatgrid to load properly, the chosen audio file must also have already been 
                  loaded into rekordbox. <br></br><br></br>

                  <strong>Save current beatgrid:</strong> Click this button to save the current tempo markers
                  to the imported rekordbox beatgrid file. <br></br>
                  Note: This will overwrite rekordbox's original beatgrid 
                  file. <br></br><br></br>

                  <strong>Import rekordbox beatgrid:</strong> Click this button to import a beatgrid file from rekordbox.
                  To create such a file, launch rekordbox, go to 'File', and click 'Export Collection in xml format'. 
                  <br></br><br></br>

                  <strong>IMPORTANT:</strong> The beatgrid will only load properly after both an audio file and a rekordbox
                  beatgrid file have been loaded. Once a beatgrid file has been loaded, any audio file specified in the
                  beatgrid file may be loaded without having to reload the beatgrid file. <br></br><br></br>

                  <strong>Editing the beatgrid:</strong> Tempo markers are green, downbeats are red, and all other beat
                  markers are blue. Only tempo markers may be moved by clicking and dragging on the rectangular handle. 
                  To create a new tempo marker, click on an existing beat marker (that is not already a tempo marker). 
                  To get rid of a tempo marker (and make it into a regular beat marker), double-click on the marker.
                </p>
              : null
          }
        </div>
      </div>
    );
  }

  setWindow = async () => {
    await window.center();
    await window.setSize({
      width: 1000,
      height: document.getElementById("windowDiv").offsetHeight + 30
    });
  }

  loadBeatgrid = async () => {
    let entries = await os.showOpenDialog('Open a file', {
      filters: [
        {name: 'beatgrid xml file', extensions: ['xml']}
      ]
    });

    var files_to_beatgrid = new Map();
    let data = await filesystem.readFile(entries[0]);
    var lines = data.split("\r\n");
    
    var filename_attr = 'Location="file://localhost';
    var tempo_attr = '<TEMPO Inizio=';
    var filename = null;
    var tempo_markers = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.includes(filename_attr)) {
        if (filename != null) {
          files_to_beatgrid.set(filename, tempo_markers);
        }

        var idx = line.indexOf(filename_attr);
        filename = line.substring(idx + filename_attr.length, line.length - 1);
        tempo_markers = [];
      }
      
      if (line.includes(tempo_attr)) {
        var tempo_marker = new Map();
        tempo_marker.set("sec", Number(readVal(line, "Inizio=\"")));
        tempo_marker.set("bpm", Number(readVal(line, "Bpm=\"")));
        
        var meter = readVal(line, "Metro=\"").split("/");
        for (var j = 0; j < meter.length; j++) {
          meter[j] = Number(meter[j]);
        }
        tempo_marker.set("meter", meter);

        tempo_marker.set("beat", Number(readVal(line, "Battito=\"")));
        tempo_markers.push(tempo_marker);
      }
    }

    files_to_beatgrid.set(filename, tempo_markers);
    this.setState({ files_to_beatgrid: files_to_beatgrid }, () => {
      console.log("set files_to_beatgrid map");
    });

    this.setState({ beatgrid_xml_file: entries[0] }, () => {
      console.log("beatgrid XML file path:", entries[0]);
    });
  }
}

export default App;
