import * as React from 'react';

export default class MissingComponentDidUpdate extends React.Component {
    constructor(props: Readonly<{}>){
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
