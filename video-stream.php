<?php
// video-stream.php

// Path to the video file
$videoFile = '/home/martin/Videos/Filmy/Inside-out_2.mp4';

// Multicast address and port
$multicastAddress = '239.3.5.7';
$port = 5004;

// Command to stream the video using ffmpeg over RTP
$command = "ffmpeg -re -i $videoFile -c:v copy -c:a copy -f rtp_mpegts rtp://$multicastAddress:$port";

// Execute the command
exec($command, $output, $return_var);

if ($return_var !== 0) {
    echo "Error streaming video. Please check the video file path and ffmpeg installation.";
} else {
    echo "Streaming video to $multicastAddress:$port using RTP";
}
?>