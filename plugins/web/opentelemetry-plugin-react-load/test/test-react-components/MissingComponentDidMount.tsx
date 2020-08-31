import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MissingComponentDidMount extends BaseOpenTelemetryComponent {
    constructor(props: Readonly<any>){
        super(props);
    }

    componentDidUpdate(prevProps: any){
    }

    shouldComponentUpdate(nextProps: any, nextState: any){
        return true;
    }
    
    getSnapshotBeforeUpdate(prevProps: any, prevState: any){
        return null;
    }

    render() {
        return(
            <div></div>
        );
    }
}
