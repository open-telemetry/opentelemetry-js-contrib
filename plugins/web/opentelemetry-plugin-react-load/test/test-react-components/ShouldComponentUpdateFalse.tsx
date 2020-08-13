import * as React from 'react';
import { BaseOpenTelemetryComponent } from '../../src';

export default class ShouldComponentUpdateFalse extends BaseOpenTelemetryComponent {
    constructor(props: Readonly<any>){
        super(props);
    }

    componentDidMount(){
    }

    componentDidUpdate(prevProps: any){
    }

    shouldComponentUpdate(nextProps: any, nextState: any){
        return false;
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
