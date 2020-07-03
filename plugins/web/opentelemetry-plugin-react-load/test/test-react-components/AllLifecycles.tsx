import * as React from 'react';

export default class AllLifecycles extends React.Component {
    constructor(props: Readonly<{}>){
        super(props);
    }

    componentDidMount(){
        console.log("mounted");
    }

    render() {
        return(
            <div></div>
        );
    }
}
