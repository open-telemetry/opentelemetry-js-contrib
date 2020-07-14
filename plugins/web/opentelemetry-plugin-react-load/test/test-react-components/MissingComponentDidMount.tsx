import * as React from 'react';

export default class MissingComponentDidMount extends React.Component {
    constructor(props: Readonly<{}>){
        super(props);
    }

    componentDidUpdate(prevProps: any){
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
