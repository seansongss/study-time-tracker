# Study Time Tracker Chrome Extension

## Overview
Study Time Tracker is a lightweight Chrome extension designed to help students and learners track the time they spend on study-related websites. Whether you're researching on academic sites, using online learning platforms, or managing study sessions, this extension provides an intuitive way to monitor your productivity and stay focused.

## Features
- **Automatic Time Tracking**: Tracks time spent on predefined study-related websites (e.g., educational platforms, academic journals, or research databases).
- **Customizable Study Sites**: Add or remove websites to your study list via the extension's options page.
- **Real-Time Dashboard**: View time spent per website in the current session and historically, with a clean and simple popup interface.
- **Local Storage**: Uses Chrome's `chrome.storage` API to store data locally, ensuring privacy with no external data transmission.
- **Reset and Export**: Reset tracked time or export data as a CSV for personal analysis.
- **Idle Detection**: Pauses tracking when the browser is inactive to ensure accurate study time measurement.

## Installation
1. **Clone or Download**: Clone this repository or download the ZIP file from GitHub and extract it to a folder.
2. **Open Chrome Extensions**: In Google Chrome, navigate to `chrome://extensions/`.
3. **Enable Developer Mode**: Toggle "Developer mode" in the top-right corner.
4. **Load Unpacked**: Click "Load unpacked" and select the folder containing the extension files (including `manifest.json`).
5. **Confirm Installation**: The Study Time Tracker icon will appear in your Chrome toolbar.

## Usage
- **Start Tracking**: Open a study-related website (predefined or added via options). The extension automatically tracks time when the tab is active.
- **View Dashboard**: Click the extension icon to see a dashboard with time spent per site for the current session and total history.
- **Manage Sites**: Right-click the extension icon and select "Options" to add or remove study websites.
- **Reset/Export**: Use the dashboard to reset tracked time or export data as a CSV file for further analysis.

## File Structure
- `manifest.json`: Defines the extension's metadata, permissions, and scripts.
- `popup.html`: The UI for the dashboard.
- `popup.js`: Handles dashboard logic and data display.
- `background.js`: Manages background time tracking and storage.
- `options.html`: Interface for managing study websites.
- `options.js`: Logic for saving and loading study site configurations.

## Privacy
This extension uses only the `chrome.storage` API to store time data and study site lists locally on your device. No data is sent to external servers, ensuring your privacy.

## Contributing
Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a clear description of your changes.

Please report bugs or suggest features via the GitHub Issues page.

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

## Future Improvements
- Add support for categorizing websites (e.g., "Math," "Science," "Literature").
- Implement Pomodoro timer integration for study sessions.
- Add visual charts for time spent in the dashboard.
- Support for cross-browser compatibility (e.g., Firefox).

Start tracking your study time today with Study Time Tracker and boost your productivity!