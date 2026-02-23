# What does MCV do?

Minecraft Computer Vision (MCV) is a tool for recreating Minecraft player poses based on images/video. It allows you to label points on a Minecraft world image with edge detection assistance and where those points lie ingame then use the data to solve the PnP problem, which is the problem of estimating the camera pose and focal length from 2D-3D correspondences. This tool was created to assist in collecting evidence for the Dream MCC 11 Parkour cheating contraversy but it can be used for many other applications, for both of these reasons it is open source and free to use for anyone.

# Applications

- Detecting cheating from gameplay footage by accurately tracking player movements, mainly useful for parkour
- Recreating maps more accurately by using an already recreated section to align the camera pose and focal length and then using that to help construct the rest of the map very precisely without having to try to manually line up your view.
  - Map recreations are also helpful for seedcracking and have been used before to find the seeds of PewDiePie's survival world as well as the pack.png placeholder texture's world.

# But what about tick alignment?

Minecraft linearly interpolates player movement between ticks, meaning a single screenshot does not have enough information to determine the location a player actually was on a tick boundary, just a sample along the line they were travelling on.
However if you have video and the framerate is at least 40FPS then this problem can be solved.

To solve this problem you first need frame level tick alignment, the best way to extrapolate this data is through animated textures like fire and particle effects like running particles as the animation swaps frames on each tick boundary. MCV can be used to label such frame change events by drawing a box around the animated texture spotted one tick before and after it changes to show where you got the data from. This tells you which two frames a tick occured between.

From this you can isolate which frames lie on a line segment between tick locations, by sampling all available points along a line (2 for 40FPS+, 3 for 60FPS+ etc) for two consecutive line segments, you can use find the intersection of the two line segments to find the tick boundary location with subframe accuracy by using a least squares regression solver.

# Finding the world coordinates

To find the world coordinates of a point you can use the debug mode (F3) and stand ontop of a corner and look straight down and crouch to align your cursor with the corner. Your player coordinates will then be the world coordinates of that corner. If you can't stand directly ontop of a block because it has stuff above it then you can either break what's above it and replace it later or alternatively measure a different corner and shift it by the appropriate amount to get the coordinates of the corner you want.

In the future I hope to make an either server or client side tool that lets you actually walk up to a corner and click it to automatically get the world coordinates or maybe a 3D voxel viewer where you can import the world or structure NBT and let you click on corners in that to get the world coordinates.

# What's included in the repo?

- /examples
  - /labeled: Some real examples of labelled points and their corresponding world coordinates along with the original images and ground truths for testing the PnP system.
  - /images: Some random images that can be used for testing the corner selector tool and edge detection.
- /python_prototype: My first working prototype of the corner selector tool and PnP solver written in python using OpenCV.

# Coming soon

The final local version of the tool will be packaged into a single portable HTML file, that way you know it's safe to run, it can have a nicer interface and it's easy to share it with your friends without needing to install anything.
I plan to host a version of the tool on my website https://dartjs.com specifically for collecting evidence for the Dream contraversy so that together we can crowdsource the data collection and publicly publish the data for anyone to analyse and I plan to analyse the data myself as well and publish the results and share it with youtubers to present the evidence in an easy to understand way.

Let's find out whether or not he cheated together!
