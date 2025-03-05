import './FileChooser.css';
import { useFilePicker } from 'use-file-picker';
import React from 'react';

export default function FileChooser() {
    const { openFilePicker, filesContent, loading, errors } = useFilePicker({
        readAs: "BinaryString",
        accept: ['.wav', '.mp3'],
        multiple: false,
        onFilesSelected: ({ plainFiles, filesContent, errors }) => {
            // this callback is always called, even if there are errors
            console.log('onFilesSelected', plainFiles, filesContent, errors);
        },
        onFilesRejected: ({ errors }) => {
            // this callback is called when there were validation errors
            console.log('Error while picking file:', errors);
        },
        onFilesSuccessfullySelected: ({ plainFiles, filesContent }) => {
            // this callback is called when there were no validation errors
            console.log('onFilesSuccessfullySelected', plainFiles, filesContent);
            var fileUrl = URL.createObjectURL(plainFiles[0]);
            console.log(fileUrl);
        },
    });
    
    return (
        <div>
            <button onClick={() => openFilePicker()}>Load track</button>
        </div>
    );
}