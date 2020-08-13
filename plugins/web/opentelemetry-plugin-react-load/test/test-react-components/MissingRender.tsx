import { BaseOpenTelemetryComponent } from '../../src';

export default class MissingRender extends BaseOpenTelemetryComponent {
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
    
    getSnapshotBeforeUpdate(prevProps: any, prevState: any){
        return null;
    }

}
