import * as React from 'react';

export default class MissingRender extends React.Component {
    constructor(props: Readonly<{}>){
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
