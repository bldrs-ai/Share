import React from "react";

const Row = ({ firstColumn, secondColumn }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        width: 270,
        justifyContent: "flex-start",
        fontSize: 12,
        marginBottom: 5,
      }}
    >
      <div
        style={{
          minWidth: 100,
          marginRight: 20,
          border: "1px solid lightGray",
        }}
      >
        {firstColumn}
      </div>
      <div
        style={{
          minWidth: 150,
          border: "1px solid lightGray",
          wordWrap: "break-word",
        }}
      >
        {secondColumn}
      </div>
    </div>
  );
};

const Info = (elementProps) => {
  elementProps = elementProps.elementProps;
  let serial = 0;
  return (
    <table>
      <tbody>
        {Object.keys(elementProps).map((key) => (
          // <tr key={serial++}>
          <Row
            firstColumn={key}
            secondColumn={JSON.stringify(elementProps[key])}
          />
          // <td>{key}</td>
          // <td>{JSON.stringify(elementProps[key])}</td>
          // </tr>
        ))}
      </tbody>
    </table>
  );
};

export { Info };
