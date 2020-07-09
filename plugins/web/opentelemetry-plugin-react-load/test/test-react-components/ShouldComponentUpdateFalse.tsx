import * as React from 'react';

export default class ShouldComponentUpdateFalse extends React.Component {
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
