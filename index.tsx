import { AppRegistry } from 'react-native';
import './src/index.css';
import App from './App';

// Explicitly register and run the application for web
AppRegistry.registerComponent('App', () => App);

AppRegistry.runApplication('App', {
  initialProps: {},
  rootTag: document.getElementById('root'),
});