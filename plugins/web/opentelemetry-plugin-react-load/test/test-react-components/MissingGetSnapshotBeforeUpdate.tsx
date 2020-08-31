import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MissingGetSnapshotBeforeUpdate extends BaseOpenTelemetryComponent {
    constructor(props: Readonly<any>){
        super(props);
    }

    componentDidMount(){
    }

    componentDidUpdate(prevProps: any){
    }

    shouldComponentUpdate(nextProps: any, nextState: any){
        return true;
    }

    render() {
        return(
            <div></div>
        );
    }
}
