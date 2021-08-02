const Info = (elementProps) => {
  elementProps = elementProps.elementProps;
  let serial = 0;
  return (
    <table>
      <tbody>
      {
        Object.keys(elementProps).map(
          key => <tr key={serial++}><td>{key}</td><td>{JSON.stringify(elementProps[key])}</td></tr>
        )
      }
      </tbody>
    </table>
  );
};

export {Info};
