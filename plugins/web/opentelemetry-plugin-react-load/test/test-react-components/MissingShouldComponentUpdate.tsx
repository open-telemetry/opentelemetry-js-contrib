import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class MisingShouldComponentUpdate extends BaseOpenTelemetryComponent {
    constructor(props: Readonly<any>){
        super(props);
    }

    componentDidMount(){
    }

    componentDidUpdate(prevProps: any){
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
