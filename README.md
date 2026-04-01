# Sentiment

## Project Overview
A web-based multi language sentiment analysis dashboard that leverages Google's Gemini AI to analyze text sentiment in real-time. You can input a sentence and it analyzes the sentiment of statement as positive, negative or neutral. 

## [Website Link](https://arnav-yadav.github.io/Sentiment/)

## Project Objectives
1. Implement a responsive web application using HTML, CSS, and JavaScript
2. Integrate Google's Gemini API for sentiment analysis
3. Visualize data using Chart.js for real-time analytics

## Technologies Used
- **Frontend**: HTML, CSS, JavaScript
- **API Integration**: Google Gemini API
- **Data Visualization**: Chart.js
- **Additional**: 
  - Font Awesome for icons
  - Google Fonts (Inter, Montserrat)

## Key Features
1. **Sentiment Analysis**
   - Real-time text analysis
   - Three-category classification (Positive, Neutral, Negative)
   - API integration with error handling

2. **Data Visualization**
   - Interactive donut chart
   - Real-time metrics updates
   - Historical data tracking
   - Pagination of data

3. **User Interface**
   - Responsive design
   - Dark mode interface
   - Grid-based layout
   - Interactive components

## Implementation Details

### API Integration
```javascript
async function analyzeSentimentWithGemini(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${gemini}`;
    // API implementation details...
}
```

### Data Visualization
```javascript
function initChart() {
    const ctx = document.getElementById('sentimentChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'doughnut',
        // Chart configuration...
    });
}
```

## Learning Outcomes
1. **API Integration**: Learned to integrate and handle responses from AI APIs
2. **Web Development**: Implemented responsive design principles and modern CSS features
3. **Data Visualization**: Created interactive charts and real-time data updates
4. **Error Handling**: Implemented robust error handling for API calls and user interactions
5. **State Management**: Managed application state for historical data and analytics
6. **Pagination**: Learned pagination and how to effectively manage and display large datasets.

## Future Enhancements
Add user authentication system and database system(Tried firebase, but was unable to execute it properly)

## Challenges Faced
1. **API Integration**: Handling asynchronous API calls and error states
2. **Real-time Updates**: Ensuring smooth updates of charts and metrics
3. **Responsive Design**: Making the dashboard work across different screen sizes
4. **Performance**: Optimizing chart rendering and data updates


## Screenshots
![image](https://github.com/user-attachments/assets/e44983c0-ef13-491a-8b00-747ac660f9d0)
![image](https://github.com/user-attachments/assets/e6299c60-666e-411a-86ab-72551846cf5d)
![image](https://github.com/user-attachments/assets/577fa8d1-5426-4d02-87a4-72a5df76b998)
![image](https://github.com/user-attachments/assets/f8498ffb-81aa-414f-a19d-d8ceeae2b51f)

