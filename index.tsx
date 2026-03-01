import React from 'react';

// Polyfill for setImmediate
if (typeof window !== 'undefined' && !window.setImmediate) {
  (window as any).setImmediate = (fn: any) => setTimeout(fn, 0);
}

import { AppRegistry } from 'react-native';
import './src/index.css';

console.log('INDEX.TSX LOADED');

import App from './App';

class GlobalErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: string}> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: '' };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error: error.toString() };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error("CRITICAL KERNEL PANIC:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{color:'#ef4444', background:'#0f172a', padding:'20px', fontFamily:'monospace', height:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center'}}>
                    <h1 style={{fontSize:'24px', marginBottom:'10px'}}>REACT CRASH</h1>
                    <p style={{color:'#fca5a5'}}>{this.state.error}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

const RootApp = () => (
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);

// Explicitly register and run the application for web
AppRegistry.registerComponent('App', () => RootApp);

AppRegistry.runApplication('App', {
  initialProps: {},
  rootTag: document.getElementById('root'),
});