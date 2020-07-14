import * as React from 'react';

export default class MissingGetSnapshotBeforeUpdate extends React.Component {
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

    render() {
        return(
            <div></div>
        );
    }
}
