import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MissingComponentDidUpdate extends BaseOpenTelemetryComponent {
    constructor(props: Readonly<any>){
        super(props);
    }

    componentDidMount(){
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
