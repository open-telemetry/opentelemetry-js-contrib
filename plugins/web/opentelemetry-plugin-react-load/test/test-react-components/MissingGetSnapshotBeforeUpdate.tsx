import * as React from 'react';

export default class MissingGetSnapshotBeforeUpdate extends React.Component {
    constructor(props: Readonly<{}>){
        super(props);
    }

    componentDidMount(){
        console.log("mounted");
    }

    componentDidUpdate(prevProps: any){
        console.log("updated");
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
