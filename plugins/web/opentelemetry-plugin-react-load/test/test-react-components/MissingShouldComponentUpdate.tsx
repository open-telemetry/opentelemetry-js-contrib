import * as React from 'react';

export default class MisingShouldComponentUpdate extends React.Component {
    constructor(props: Readonly<{}>){
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
