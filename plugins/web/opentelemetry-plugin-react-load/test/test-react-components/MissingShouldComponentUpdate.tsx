import * as React from 'react';

export default class MisingShouldComponentUpdate extends React.Component {
    constructor(props: Readonly<{}>){
        super(props);
    }

    componentDidMount(){
        console.log("mounted");
    }

    componentDidUpdate(prevProps: any){
        console.log("updated");
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
